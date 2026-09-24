type ConversationMessages = { messages: Array<{ id: string | number; sender: string }> };

export function collectVisitorMessageIds(conversations: ConversationMessages[]) {
  return new Set(conversations.flatMap((conversation) => conversation.messages
    .filter((message) => message.sender === 'visitor')
    .map((message) => String(message.id))));
}

export function hasUnseenVisitorMessage(conversations: ConversationMessages[], seenIds: Set<string> | null) {
  if (!seenIds) return false;
  return [...collectVisitorMessageIds(conversations)].some((id) => !seenIds.has(id));
}
