/**
 * Server-Sent Events (SSE) streaming utilities for real-time agent communication
 */

import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

// Message types for the chat stream
export type ChatMessageType = 
  | 'user_message'
  | 'agent_message' 
  | 'agent_thinking'
  | 'agent_tool_use'
  | 'agent_tool_result'
  | 'status_update'
  | 'error'
  | 'complete';

export interface ChatMessage {
  id: string;
  type: ChatMessageType;
  content: string;
  timestamp: string;
  metadata?: {
    toolName?: string;
    toolInput?: Record<string, any>;
    toolResult?: any;
    progress?: number;
    workflowState?: string;
  };
}

export interface StreamController {
  send: (message: ChatMessage) => void;
  sendText: (content: string) => void;
  sendThinking: (content: string) => void;
  sendToolUse: (toolName: string, input: Record<string, any>) => void;
  sendToolResult: (toolName: string, result: any) => void;
  sendStatus: (status: string, progress?: number, workflowState?: string) => void;
  sendError: (error: string) => void;
  complete: () => void;
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a stream controller for sending SSE messages
 */
export function createStreamController(
  stream: { writeSSE: (data: { data: string; event?: string; id?: string }) => Promise<void> }
): StreamController {
  const sendMessage = async (message: ChatMessage) => {
    await stream.writeSSE({
      data: JSON.stringify(message),
      event: message.type,
      id: message.id,
    });
  };

  return {
    send: (message: ChatMessage) => {
      sendMessage(message);
    },

    sendText: (content: string) => {
      sendMessage({
        id: generateMessageId(),
        type: 'agent_message',
        content,
        timestamp: new Date().toISOString(),
      });
    },

    sendThinking: (content: string) => {
      sendMessage({
        id: generateMessageId(),
        type: 'agent_thinking',
        content,
        timestamp: new Date().toISOString(),
      });
    },

    sendToolUse: (toolName: string, input: Record<string, any>) => {
      sendMessage({
        id: generateMessageId(),
        type: 'agent_tool_use',
        content: `Using tool: ${toolName}`,
        timestamp: new Date().toISOString(),
        metadata: { toolName, toolInput: input },
      });
    },

    sendToolResult: (toolName: string, result: any) => {
      sendMessage({
        id: generateMessageId(),
        type: 'agent_tool_result',
        content: `Tool ${toolName} completed`,
        timestamp: new Date().toISOString(),
        metadata: { toolName, toolResult: result },
      });
    },

    sendStatus: (status: string, progress?: number, workflowState?: string) => {
      sendMessage({
        id: generateMessageId(),
        type: 'status_update',
        content: status,
        timestamp: new Date().toISOString(),
        metadata: { progress, workflowState },
      });
    },

    sendError: (error: string) => {
      sendMessage({
        id: generateMessageId(),
        type: 'error',
        content: error,
        timestamp: new Date().toISOString(),
      });
    },

    complete: () => {
      sendMessage({
        id: generateMessageId(),
        type: 'complete',
        content: 'Stream completed',
        timestamp: new Date().toISOString(),
      });
    },
  };
}

/**
 * Create an SSE stream response for chat
 */
export async function createChatStream(
  c: Context,
  handler: (controller: StreamController) => Promise<void>
) {
  return streamSSE(c, async (stream) => {
    const controller = createStreamController(stream);
    
    try {
      await handler(controller);
    } catch (error) {
      controller.sendError(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      controller.complete();
    }
  });
}

/**
 * In-memory store for active chat sessions
 */
interface ChatSession {
  analysisId: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const chatSessions = new Map<string, ChatSession>();

export function getChatSession(analysisId: string): ChatSession | undefined {
  return chatSessions.get(analysisId);
}

export function createChatSession(analysisId: string, userId: string): ChatSession {
  const session: ChatSession = {
    analysisId,
    userId,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  chatSessions.set(analysisId, session);
  return session;
}

export function addMessageToSession(analysisId: string, message: ChatMessage): void {
  const session = chatSessions.get(analysisId);
  if (session) {
    session.messages.push(message);
    session.updatedAt = new Date();
  }
}

export function clearChatSession(analysisId: string): void {
  chatSessions.delete(analysisId);
}

