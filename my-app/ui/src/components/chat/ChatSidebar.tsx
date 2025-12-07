import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageBubble, ChatMessage } from './MessageBubble';
import { Send, X, MessageSquare, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/serverComm';

interface ChatSidebarProps {
  analysisId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function ChatSidebar({ analysisId, isOpen, onClose, onToggle }: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Connect to SSE stream when analysis is selected
  const connectToStream = useCallback(async () => {
    if (!analysisId || eventSourceRef.current) return;

    setIsConnecting(true);
    
    try {
      // Get auth token for SSE connection
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500';
      const streamUrl = `${API_BASE_URL}/api/v1/survival/analyses/${analysisId}/chat/stream`;
      
      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
      };

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ChatMessage;
          setMessages((prev) => [...prev, message]);
        } catch (e) {
          console.error('Failed to parse SSE message:', e);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        setIsConnecting(false);
        eventSource.close();
        eventSourceRef.current = null;
      };

      // Listen for specific event types
      const eventTypes = [
        'agent_message',
        'agent_thinking', 
        'agent_tool_use',
        'agent_tool_result',
        'status_update',
        'error',
        'complete'
      ];

      eventTypes.forEach((type) => {
        eventSource.addEventListener(type, (event: MessageEvent) => {
          try {
            const message = JSON.parse(event.data) as ChatMessage;
            setMessages((prev) => [...prev, message]);
          } catch (e) {
            console.error(`Failed to parse ${type} event:`, e);
          }
        });
      });
    } catch (error) {
      console.error('Failed to connect to chat stream:', error);
      setIsConnecting(false);
    }
  }, [analysisId]);

  // Disconnect from stream
  const disconnectFromStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Load chat history when analysis changes
  useEffect(() => {
    if (analysisId) {
      // Load existing messages
      loadChatHistory();
    } else {
      setMessages([]);
      disconnectFromStream();
    }

    return () => {
      disconnectFromStream();
    };
  }, [analysisId, disconnectFromStream]);

  const loadChatHistory = async () => {
    if (!analysisId) return;

    try {
      const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}/chat/history`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || !analysisId || isSending) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      type: 'user_message',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsSending(true);

    try {
      const response = await fetchWithAuth(`/api/v1/survival/analyses/${analysisId}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputValue.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Connect to stream if not already connected
      if (!isConnected) {
        connectToStream();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          type: 'error',
          content: 'Failed to send message. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg z-50"
        onClick={onToggle}
      >
        <MessageSquare className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h3 className="font-semibold">Agent Chat</h3>
          {isConnected && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!analysisId ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
            <p>Select an analysis to start chatting with the agent</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
            <p>No messages yet</p>
            <p className="text-sm">Send a message to interact with the agent</p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        {isConnecting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting...
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={analysisId ? "Ask the agent..." : "Select an analysis first"}
            disabled={!analysisId || isSending}
            className="flex-1"
          />
          <Button 
            onClick={sendMessage} 
            disabled={!analysisId || !inputValue.trim() || isSending}
            size="icon"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

