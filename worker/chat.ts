// ============================================================================
// Lekhoni Kahini Writer Messaging System Backend
// Cloudflare Worker Handler (REST API + WebSockets + FCM + R2)
// ============================================================================

import type { Env } from './index';

// In-memory active WebSocket connections per writer ID
export const activeSockets = new Map<string, Set<WebSocket>>();

export function addSocket(writerId: string, ws: WebSocket) {
  if (!activeSockets.has(writerId)) {
    activeSockets.set(writerId, new Set());
  }
  activeSockets.get(writerId)!.add(ws);
}

export function removeSocket(writerId: string, ws: WebSocket): boolean {
  const set = activeSockets.get(writerId);
  if (!set) return false;
  set.delete(ws);
  if (set.size === 0) {
    activeSockets.delete(writerId);
    return true; // No more sockets for this writer
  }
  return false;
}

export function broadcastToWriter(writerId: string, data: any) {
  const set = activeSockets.get(writerId);
  if (!set || set.size === 0) return 0;
  const payload = JSON.stringify(data);
  let delivered = 0;
  for (const ws of set) {
    try {
      ws.send(payload);
      delivered++;
    } catch (_) {
      set.delete(ws);
    }
  }
  return delivered;
}

export function isWriterOnline(writerId: string): boolean {
  const set = activeSockets.get(writerId);
  return Boolean(set && set.size > 0);
}

const corsHeaders = (origin = '*') => ({
  'content-type': 'application/json',
  'access-control-allow-origin': origin,
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders('*') });

// Helper to generate consistent direct key between two writers
export function getDirectKey(w1: string, w2: string): string {
  return [w1, w2].sort().join('_');
}

// ============================================================================
// 1. WebSocket Handler (/api/ws/chat?token=<jwt>)
// ============================================================================
export async function handleChatWebSocket(
  request: Request,
  env: Env,
  url: URL,
  sql: any,
  verifyJWT: (token: string) => Promise<any>
): Promise<Response> {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const token = url.searchParams.get('token') || '';
  if (!token) {
    return new Response('Token required', { status: 401 });
  }

  const payload = await verifyJWT(token);
  if (!payload?.id) {
    return new Response('Invalid or expired token', { status: 401 });
  }

  const writerId = payload.id as string;

  // Verify writer exists in DB
  const writerRow = await sql`SELECT id, username, writer_name, avatar_url FROM writers WHERE id=${writerId} AND is_active=1 LIMIT 1`;
  if (!writerRow.length) {
    return new Response('Writer not found or deactivated', { status: 404 });
  }

  // Create Cloudflare WebSocket pair
  const pair = new (globalThis as any).WebSocketPair();
  const client: WebSocket = pair[0];
  const server: WebSocket = pair[1];

  (server as any).accept();

  addSocket(writerId, server);

  // Update online presence in DB
  try {
    await sql`INSERT INTO user_presence (writer_id, is_online, last_seen_at, updated_at) 
              VALUES (${writerId}, 1, datetime('now'), datetime('now'))
              ON CONFLICT(writer_id) DO UPDATE SET is_online=1, last_seen_at=datetime('now'), updated_at=datetime('now')`;
  } catch (e) {
    console.error('presence update error', e);
  }

  // Send initial connected confirmation
  try {
    server.send(JSON.stringify({
      type: 'connected',
      writer_id: writerId,
      timestamp: new Date().toISOString(),
    }));
  } catch (_) {}

  server.addEventListener('message', async (event: any) => {
    try {
      const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
      const data = JSON.parse(raw);

      if (data.type === 'ping') {
        server.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }

      // Typing indicator
      if (data.type === 'typing') {
        const convId = data.conversation_id;
        const isTyping = Boolean(data.is_typing);
        if (!convId) return;

        // Verify membership and get other members
        const members = await sql`SELECT writer_id FROM conversation_members WHERE conversation_id=${convId}`;
        for (const m of members) {
          if (m.writer_id !== writerId) {
            broadcastToWriter(m.writer_id, {
              type: 'typing',
              conversation_id: convId,
              writer_id: writerId,
              is_typing: isTyping,
            });
          }
        }
        return;
      }

      // Mark read via WebSocket
      if (data.type === 'mark_read') {
        const convId = data.conversation_id;
        if (!convId) return;

        await sql`UPDATE conversation_members SET unread_count=0, last_read_at=datetime('now') WHERE conversation_id=${convId} AND writer_id=${writerId}`;
        await sql`UPDATE messages SET status='read' WHERE conversation_id=${convId} AND sender_id!=${writerId} AND status!='read'`;

        const members = await sql`SELECT writer_id FROM conversation_members WHERE conversation_id=${convId}`;
        for (const m of members) {
          if (m.writer_id !== writerId) {
            broadcastToWriter(m.writer_id, {
              type: 'messages_read',
              conversation_id: convId,
              reader_id: writerId,
              timestamp: new Date().toISOString(),
            });
          }
        }
        return;
      }
    } catch (e) {
      console.error('ws message error', e);
    }
  });

  const handleClose = async () => {
    const isNowOffline = removeSocket(writerId, server);
    if (isNowOffline) {
      try {
        await sql`INSERT INTO user_presence (writer_id, is_online, last_seen_at, updated_at) 
                  VALUES (${writerId}, 0, datetime('now'), datetime('now'))
                  ON CONFLICT(writer_id) DO UPDATE SET is_online=0, last_seen_at=datetime('now'), updated_at=datetime('now')`;
      } catch (e) {
        console.error('offline presence error', e);
      }
    }
  };

  server.addEventListener('close', handleClose);
  server.addEventListener('error', handleClose);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

// ============================================================================
// 2. Chat REST API Endpoints (/api/writer/chat/*)
// ============================================================================
export async function handleChatApi(
  request: Request,
  env: Env,
  url: URL,
  sql: any,
  writerId: string,
  sendPush: (tokens: string[], title: string, body: string, data: any) => Promise<any>
): Promise<Response | null> {
  const path = url.pathname;

  // ── A. Search Writers ───────────────────────────────────────────────────
  if (path === '/api/writer/chat/search-writers' && request.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q || q.length < 1) return json([]);

    const pattern = `%${q}%`;
    const rows = await sql`
      SELECT id, username, writer_name, avatar_url, bio, follower_count, badge
      FROM writers
      WHERE (username LIKE ${pattern} OR writer_name LIKE ${pattern})
        AND id != ${writerId}
        AND is_active = 1
      ORDER BY follower_count DESC, created_at DESC
      LIMIT 25`;
    return json(rows);
  }

  // ── B. Conversations List ───────────────────────────────────────────────
  if (path === '/api/writer/chat/conversations' && request.method === 'GET') {
    // Get all conversations this writer belongs to with the other participant's profile & presence
    const rows = await sql`
      SELECT 
        c.id AS conversation_id,
        c.direct_key,
        c.last_message_id,
        c.last_message_text,
        c.last_message_at,
        cm.unread_count,
        cm.is_muted,
        w.id AS other_writer_id,
        w.username AS other_username,
        w.writer_name AS other_name,
        COALESCE(w.avatar_url, '') AS other_avatar,
        COALESCE(w.badge, 'none') AS other_badge,
        COALESCE(up.is_online, 0) AS is_online,
        COALESCE(up.last_seen_at, '') AS last_seen_at,
        (SELECT COUNT(1) FROM user_blocks ub WHERE (ub.blocker_id=${writerId} AND ub.blocked_id=w.id) OR (ub.blocker_id=w.id AND ub.blocked_id=${writerId})) AS is_blocked
      FROM conversation_members cm
      JOIN conversations c ON c.id = cm.conversation_id
      JOIN conversation_members cm_other ON cm_other.conversation_id = c.id AND cm_other.writer_id != ${writerId}
      JOIN writers w ON w.id = cm_other.writer_id
      LEFT JOIN user_presence up ON up.writer_id = w.id
      WHERE cm.writer_id = ${writerId}
      ORDER BY c.last_message_at DESC, c.created_at DESC`;

    const mapped = rows.map((r: any) => ({
      id: r.conversation_id,
      direct_key: r.direct_key,
      last_message_id: r.last_message_id,
      last_message_text: r.last_message_text || '',
      last_message_at: r.last_message_at || '',
      unread_count: Number(r.unread_count || 0),
      is_muted: Boolean(r.is_muted),
      is_blocked: Number(r.is_blocked || 0) > 0,
      participant: {
        id: r.other_writer_id,
        username: r.other_username,
        writer_name: r.other_name,
        avatar_url: r.other_avatar,
        badge: r.other_badge,
        is_online: Boolean(isWriterOnline(r.other_writer_id) || r.is_online === 1),
        last_seen_at: r.last_seen_at,
      },
    }));

    return json(mapped);
  }

  // ── C. Start or Get Direct Conversation ─────────────────────────────────
  if (path === '/api/writer/chat/conversations' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { recipient_id?: string };
    const recipientId = (body.recipient_id || '').trim();

    if (!recipientId || recipientId === writerId) {
      return json({ error: 'Valid recipient_id required' }, 400);
    }

    // Verify recipient exists
    const recRow = await sql`SELECT id, username, writer_name, avatar_url, badge FROM writers WHERE id=${recipientId} AND is_active=1 LIMIT 1`;
    if (!recRow.length) {
      return json({ error: 'Recipient writer not found' }, 404);
    }

    // Check blocks
    const blockCheck = await sql`
      SELECT blocker_id FROM user_blocks 
      WHERE (blocker_id=${writerId} AND blocked_id=${recipientId}) 
         OR (blocker_id=${recipientId} AND blocked_id=${writerId}) 
      LIMIT 1`;
    if (blockCheck.length) {
      return json({ error: 'blocked', message: 'এই ব্যবহারকারীকে মেসেজ পাঠানো সম্ভব নয়' }, 403);
    }

    const directKey = getDirectKey(writerId, recipientId);

    // Check if conversation already exists
    const existing = await sql`SELECT id FROM conversations WHERE direct_key=${directKey} LIMIT 1`;
    let conversationId: string;

    if (existing.length) {
      conversationId = existing[0].id;
    } else {
      conversationId = crypto.randomUUID();
      const now = new Date().toISOString();
      await sql`INSERT INTO conversations (id, direct_key, last_message_text, last_message_at, created_at, updated_at) 
                VALUES (${conversationId}, ${directKey}, '', ${now}, ${now}, ${now})`;

      // Add both members
      await sql`INSERT INTO conversation_members (id, conversation_id, writer_id, unread_count, created_at)
                VALUES (${crypto.randomUUID()}, ${conversationId}, ${writerId}, 0, ${now}),
                       (${crypto.randomUUID()}, ${conversationId}, ${recipientId}, 0, ${now})`;
    }

    // Return conversation details
    const other = recRow[0];
    const presence = await sql`SELECT is_online, last_seen_at FROM user_presence WHERE writer_id=${recipientId} LIMIT 1`;

    return json({
      id: conversationId,
      direct_key: directKey,
      participant: {
        id: other.id,
        username: other.username,
        writer_name: other.writer_name,
        avatar_url: other.avatar_url || '',
        badge: other.badge || 'none',
        is_online: Boolean(isWriterOnline(recipientId) || presence[0]?.is_online === 1),
        last_seen_at: presence[0]?.last_seen_at || '',
      },
    }, 201);
  }

  // ── D. Get Messages for Conversation (Cursor Paginated) ──────────────────
  const messagesMatch = path.match(/^\/api\/writer\/chat\/conversations\/([^/]+)\/messages$/);
  if (messagesMatch && request.method === 'GET') {
    const convId = messagesMatch[1];

    // Verify caller is a member
    const memberCheck = await sql`SELECT id FROM conversation_members WHERE conversation_id=${convId} AND writer_id=${writerId} LIMIT 1`;
    if (!memberCheck.length) {
      return json({ error: 'Forbidden' }, 403);
    }

    const beforeId = url.searchParams.get('before_id') || '';
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));

    let rows: any[];
    if (beforeId) {
      const cursorRow = await sql`SELECT created_at FROM messages WHERE id=${beforeId} LIMIT 1`;
      if (cursorRow.length) {
        rows = await sql`
          SELECT m.id, m.conversation_id, m.sender_id, m.reply_to_id, m.message_type,
                 m.content, m.media_url, m.media_meta, m.status, m.is_deleted, m.deleted_for, m.reactions, m.created_at,
                 r.content AS reply_content, r.sender_id AS reply_sender_id,
                 rw.writer_name AS reply_sender_name
          FROM messages m
          LEFT JOIN messages r ON r.id = m.reply_to_id
          LEFT JOIN writers rw ON rw.id = r.sender_id
          WHERE m.conversation_id = ${convId}
            AND m.created_at < ${cursorRow[0].created_at}
          ORDER BY m.created_at DESC
          LIMIT ${limit + 1}`;
      } else {
        rows = [];
      }
    } else {
      rows = await sql`
        SELECT m.id, m.conversation_id, m.sender_id, m.reply_to_id, m.message_type,
               m.content, m.media_url, m.media_meta, m.status, m.is_deleted, m.deleted_for, m.reactions, m.created_at,
               r.content AS reply_content, r.sender_id AS reply_sender_id,
               rw.writer_name AS reply_sender_name
        FROM messages m
        LEFT JOIN messages r ON r.id = m.reply_to_id
        LEFT JOIN writers rw ON rw.id = r.sender_id
        WHERE m.conversation_id = ${convId}
        ORDER BY m.created_at DESC
        LIMIT ${limit + 1}`;
    }

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Filter out messages deleted for caller
    const result = items
      .filter((m: any) => {
        try {
          const deletedFor = JSON.parse(m.deleted_for || '[]');
          return !deletedFor.includes(writerId);
        } catch (_) {
          return true;
        }
      })
      .map((m: any) => {
        const isDeleted = Boolean(m.is_deleted);
        let parsedReactions = {};
        try {
          parsedReactions = JSON.parse(m.reactions || '{}');
        } catch (_) {}
        return {
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          is_me: m.sender_id === writerId,
          reply_to_id: m.reply_to_id,
          reply: m.reply_to_id
            ? {
                id: m.reply_to_id,
                content: m.reply_content || '',
                sender_name: m.reply_sender_name || 'লেখক',
              }
            : null,
          message_type: m.message_type,
          content: isDeleted ? 'এই বার্তাটি মুছে ফেলা হয়েছে' : m.content,
          media_url: isDeleted ? '' : m.media_url,
          media_meta: isDeleted ? {} : JSON.parse(m.media_meta || '{}'),
          status: m.status,
          is_deleted: isDeleted,
          reactions: parsedReactions,
          created_at: m.created_at,
        };
      })
      .reverse(); // Return in chronological ascending order for UI

    return json({ messages: result, has_more: hasMore });
  }

  // ── E. Send Message ──────────────────────────────────────────────────────
  if (messagesMatch && request.method === 'POST') {
    const convId = messagesMatch[1];

    // Verify caller is a member
    const memberCheck = await sql`SELECT writer_id FROM conversation_members WHERE conversation_id=${convId}`;
    if (!memberCheck.some((m: any) => m.writer_id === writerId)) {
      return json({ error: 'Forbidden' }, 403);
    }

    const otherMember = memberCheck.find((m: any) => m.writer_id !== writerId);
    const recipientId = otherMember?.writer_id;

    if (!recipientId) {
      return json({ error: 'Conversation participant missing' }, 400);
    }

    // Check blocks
    const blockCheck = await sql`
      SELECT blocker_id FROM user_blocks 
      WHERE (blocker_id=${writerId} AND blocked_id=${recipientId}) 
         OR (blocker_id=${recipientId} AND blocked_id=${writerId}) 
      LIMIT 1`;
    if (blockCheck.length) {
      return json({ error: 'blocked', message: 'মেসেজ পাঠানো সম্ভব নয়' }, 403);
    }

    const body = (await request.json().catch(() => ({}))) as {
      content?: string;
      message_type?: string;
      media_url?: string;
      media_meta?: any;
      reply_to_id?: string;
    };

    const content = (body.content || '').trim().slice(0, 5000);
    const messageType = body.message_type === 'image' ? 'image' : 'text';
    const mediaUrl = (body.media_url || '').trim();
    const mediaMeta = JSON.stringify(body.media_meta || {});
    const replyToId = body.reply_to_id || null;

    if (!content && !mediaUrl) {
      return json({ error: 'Message content or media required' }, 400);
    }

    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Check if recipient is online in real-time
    const recipientOnline = isWriterOnline(recipientId);
    const initialStatus = recipientOnline ? 'delivered' : 'sent';

    // 1. Insert message
    await sql`
      INSERT INTO messages (id, conversation_id, sender_id, reply_to_id, message_type, content, media_url, media_meta, status, created_at, updated_at)
      VALUES (${messageId}, ${convId}, ${writerId}, ${replyToId}, ${messageType}, ${content}, ${mediaUrl}, ${mediaMeta}, ${initialStatus}, ${now}, ${now})`;

    // 2. Update conversation snippet
    const snippet = messageType === 'image' ? '📷 ছবি' : content.slice(0, 80);
    await sql`
      UPDATE conversations 
      SET last_message_id=${messageId}, last_message_text=${snippet}, last_message_at=${now}, updated_at=${now}
      WHERE id=${convId}`;

    // 3. Update unread count for recipient
    await sql`
      UPDATE conversation_members
      SET unread_count = unread_count + 1
      WHERE conversation_id = ${convId} AND writer_id = ${recipientId}`;

    // 4. Reset sender's unread & set last_read_message_id
    await sql`
      UPDATE conversation_members
      SET unread_count = 0, last_read_message_id = ${messageId}, last_read_at = ${now}
      WHERE conversation_id = ${convId} AND writer_id = ${writerId}`;

    // 5. Fetch sender details for real-time and push notification
    const senderRow = await sql`SELECT writer_name, avatar_url FROM writers WHERE id=${writerId} LIMIT 1`;
    const senderName = senderRow[0]?.writer_name || 'লেখক';

    // Fetch reply snippet if any
    let replyObj: any = null;
    if (replyToId) {
      const rep = await sql`SELECT m.content, w.writer_name FROM messages m JOIN writers w ON w.id=m.sender_id WHERE m.id=${replyToId} LIMIT 1`;
      if (rep.length) {
        replyObj = {
          id: replyToId,
          content: rep[0].content,
          sender_name: rep[0].writer_name,
        };
      }
    }

    const messagePayload = {
      id: messageId,
      conversation_id: convId,
      sender_id: writerId,
      sender_name: senderName,
      is_me: false,
      reply_to_id: replyToId,
      reply: replyObj,
      message_type: messageType,
      content,
      media_url: mediaUrl,
      media_meta: body.media_meta || {},
      status: initialStatus,
      is_deleted: false,
      reactions: {},
      created_at: now,
    };

    // 6. Broadcast via WebSocket if recipient online
    const socketsReached = broadcastToWriter(recipientId, {
      type: 'new_message',
      conversation_id: convId,
      message: messagePayload,
    });

    // 7. If recipient offline or background push notification needed
    if (socketsReached === 0) {
      try {
        const deviceRows = await sql`SELECT push_token FROM writer_devices WHERE writer_id=${recipientId} AND push_token != ''`;
        const tokens = deviceRows.map((d: any) => d.push_token);

        if (tokens.length > 0) {
          const pushTitle = senderName;
          const pushBody = messageType === 'image' ? '📷 ছবি পাঠিয়েছেন' : content;
          await sendPush(tokens, pushTitle, pushBody, {
            type: 'chat_message',
            conversation_id: convId,
            sender_id: writerId,
            sender_name: senderName,
            sender_avatar: senderRow[0]?.avatar_url || '',
          });
        }
      } catch (pushErr) {
        console.error('Chat push notification error:', pushErr);
      }
    }

    return json({
      ok: true,
      message: {
        ...messagePayload,
        is_me: true,
      },
    }, 201);
  }

  // ── F. Mark Conversation as Read ─────────────────────────────────────────
  const readMatch = path.match(/^\/api\/writer\/chat\/conversations\/([^/]+)\/read$/);
  if (readMatch && request.method === 'POST') {
    const convId = readMatch[1];
    const now = new Date().toISOString();

    await sql`
      UPDATE conversation_members 
      SET unread_count = 0, last_read_at = ${now} 
      WHERE conversation_id = ${convId} AND writer_id = ${writerId}`;

    await sql`
      UPDATE messages 
      SET status = 'read', updated_at = ${now} 
      WHERE conversation_id = ${convId} AND sender_id != ${writerId} AND status != 'read'`;

    // Notify other participant of read receipt
    const members = await sql`SELECT writer_id FROM conversation_members WHERE conversation_id=${convId}`;
    for (const m of members) {
      if (m.writer_id !== writerId) {
        broadcastToWriter(m.writer_id, {
          type: 'messages_read',
          conversation_id: convId,
          reader_id: writerId,
          timestamp: now,
        });
      }
    }

    return json({ ok: true });
  }

  // ── G. Delete Message ───────────────────────────────────────────────────
  const deleteMatch = path.match(/^\/api\/writer\/chat\/messages\/([^/]+)\/delete$/);
  if (deleteMatch && request.method === 'POST') {
    const msgId = deleteMatch[1];
    const body = (await request.json().catch(() => ({}))) as { delete_for_everyone?: boolean };
    const deleteForEveryone = Boolean(body.delete_for_everyone);

    const msgRow = await sql`SELECT id, conversation_id, sender_id, is_deleted, deleted_for FROM messages WHERE id=${msgId} LIMIT 1`;
    if (!msgRow.length) return json({ error: 'Message not found' }, 404);

    const msg = msgRow[0];
    const convId = msg.conversation_id;

    // Verify membership
    const member = await sql`SELECT 1 FROM conversation_members WHERE conversation_id=${convId} AND writer_id=${writerId} LIMIT 1`;
    if (!member.length) return json({ error: 'Forbidden' }, 403);

    if (deleteForEveryone) {
      // Only sender can delete for everyone
      if (msg.sender_id !== writerId) {
        return json({ error: 'Only the sender can delete for everyone' }, 403);
      }

      await sql`
        UPDATE messages 
        SET is_deleted = 1, content = 'এই বার্তাটি মুছে ফেলা হয়েছে', media_url = '', updated_at = datetime('now')
        WHERE id = ${msgId}`;

      // Broadcast to members
      const members = await sql`SELECT writer_id FROM conversation_members WHERE conversation_id=${convId}`;
      for (const m of members) {
        broadcastToWriter(m.writer_id, {
          type: 'message_deleted',
          message_id: msgId,
          conversation_id: convId,
          delete_for_everyone: true,
        });
      }
    } else {
      // Delete for me
      let deletedFor: string[] = [];
      try {
        deletedFor = JSON.parse(msg.deleted_for || '[]');
      } catch (_) {}

      if (!deletedFor.includes(writerId)) {
        deletedFor.push(writerId);
        await sql`
          UPDATE messages 
          SET deleted_for = ${JSON.stringify(deletedFor)}, updated_at = datetime('now')
          WHERE id = ${msgId}`;
      }
    }

    return json({ ok: true });
  }

  // ── G2. React to Message (6 quick reacts + custom emoji) ─────────────────
  const reactMatch = path.match(/^\/api\/writer\/chat\/messages\/([^/]+)\/react$/);
  if (reactMatch && request.method === 'POST') {
    const msgId = reactMatch[1];
    const body = (await request.json().catch(() => ({}))) as { emoji?: string };
    const emoji = (body.emoji || '').trim();
    if (!emoji) return json({ error: 'Emoji is required' }, 400);

    const msgRow = await sql`SELECT id, conversation_id, reactions FROM messages WHERE id=${msgId} LIMIT 1`;
    if (!msgRow.length) return json({ error: 'Message not found' }, 404);

    const msg = msgRow[0];
    const convId = msg.conversation_id;

    // Verify membership
    const member = await sql`SELECT 1 FROM conversation_members WHERE conversation_id=${convId} AND writer_id=${writerId} LIMIT 1`;
    if (!member.length) return json({ error: 'Forbidden' }, 403);

    let reactions: Record<string, string[]> = {};
    try {
      reactions = JSON.parse(msg.reactions || '{}');
    } catch (_) {
      reactions = {};
    }

    // Toggle logic: If user already reacted with this emoji, remove it.
    // If user clicked this emoji again, it removes. If another emoji, it switches or adds.
    let alreadyHadThis = false;
    for (const key of Object.keys(reactions)) {
      if (key === emoji && reactions[key].includes(writerId)) {
        alreadyHadThis = true;
      }
      reactions[key] = reactions[key].filter(id => id !== writerId);
      if (reactions[key].length === 0) {
        delete reactions[key];
      }
    }

    if (!alreadyHadThis) {
      if (!reactions[emoji]) reactions[emoji] = [];
      reactions[emoji].push(writerId);
    }

    const updatedReactionsJson = JSON.stringify(reactions);
    await sql`UPDATE messages SET reactions = ${updatedReactionsJson}, updated_at = datetime('now') WHERE id = ${msgId}`;

    // Broadcast reaction event to conversation members
    const members = await sql`SELECT writer_id FROM conversation_members WHERE conversation_id=${convId}`;
    for (const m of members) {
      broadcastToWriter(m.writer_id, {
        type: 'message_reaction',
        conversation_id: convId,
        message_id: msgId,
        emoji,
        reactions,
        user_id: writerId,
      });
    }

    return json({ ok: true, reactions });
  }

  // ── H. Media Attachment Upload (R2 Storage) ─────────────────────────────
  if (path === '/api/writer/chat/upload' && request.method === 'POST') {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return json({ error: 'File is required' }, 400);
    }

    if (!file.type.startsWith('image/')) {
      return json({ error: 'Only images are supported for attachments' }, 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return json({ error: 'Attachment must be under 10MB' }, 400);
    }

    const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'webp';
    const key = `chat/${writerId}/${crypto.randomUUID()}.${ext}`;

    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    const publicUrl = `${env.MEDIA_PUBLIC_URL}/${key}`;
    return json({
      ok: true,
      url: publicUrl,
      key,
      size: file.size,
      mime: file.type,
    }, 201);
  }

  // ── I. Device Push Token Registration ───────────────────────────────────
  if (path === '/api/writer/chat/device-token' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as {
      device_key?: string;
      push_token?: string;
      platform?: string;
    };

    const deviceKey = (body.device_key || '').trim();
    const pushToken = (body.push_token || '').trim();
    const platform = (body.platform || 'android').trim();

    if (!deviceKey || !pushToken) {
      return json({ error: 'device_key and push_token required' }, 400);
    }

    await sql`
      INSERT INTO writer_devices (id, writer_id, device_key, push_token, platform, updated_at)
      VALUES (${crypto.randomUUID()}, ${writerId}, ${deviceKey}, ${pushToken}, ${platform}, datetime('now'))
      ON CONFLICT(writer_id, device_key) DO UPDATE SET push_token=EXCLUDED.push_token, updated_at=datetime('now')`;

    return json({ ok: true });
  }

  // ── J. Block & Unblock Writer ───────────────────────────────────────────
  if (path === '/api/writer/chat/block' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { target_writer_id?: string };
    const targetId = (body.target_writer_id || '').trim();

    if (!targetId || targetId === writerId) {
      return json({ error: 'Valid target_writer_id required' }, 400);
    }

    await sql`
      INSERT INTO user_blocks (id, blocker_id, blocked_id, created_at)
      VALUES (${crypto.randomUUID()}, ${writerId}, ${targetId}, datetime('now'))
      ON CONFLICT(blocker_id, blocked_id) DO NOTHING`;

    return json({ ok: true, message: 'ব্যবহারকারীকে ব্লক করা হয়েছে' });
  }

  if (path === '/api/writer/chat/unblock' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { target_writer_id?: string };
    const targetId = (body.target_writer_id || '').trim();

    if (!targetId) return json({ error: 'Valid target_writer_id required' }, 400);

    await sql`DELETE FROM user_blocks WHERE blocker_id=${writerId} AND blocked_id=${targetId}`;
    return json({ ok: true, message: 'ব্যবহারকারীকে আনব্লক করা হয়েছে' });
  }

  // ── K. Get Writer Presence ──────────────────────────────────────────────
  const presenceMatch = path.match(/^\/api\/writer\/chat\/presence\/([^/]+)$/);
  if (presenceMatch && request.method === 'GET') {
    const targetId = presenceMatch[1];
    const online = isWriterOnline(targetId);
    const row = await sql`SELECT last_seen_at FROM user_presence WHERE writer_id=${targetId} LIMIT 1`;

    return json({
      writer_id: targetId,
      is_online: online,
      last_seen_at: row[0]?.last_seen_at || '',
    });
  }

  // Not matched
  return null;
}
