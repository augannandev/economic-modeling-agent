import { cn } from "@/lib/utils";
import { Bot, User, Wrench, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export type MessageType = 
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
  type: MessageType;
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

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.type === 'user_message';
  const isThinking = message.type === 'agent_thinking';
  const isToolUse = message.type === 'agent_tool_use';
  const isToolResult = message.type === 'agent_tool_result';
  const isStatus = message.type === 'status_update';
  const isError = message.type === 'error';
  const isComplete = message.type === 'complete';

  const getIcon = () => {
    if (isUser) return <User className="h-4 w-4" />;
    if (isToolUse || isToolResult) return <Wrench className="h-4 w-4" />;
    if (isError) return <AlertCircle className="h-4 w-4" />;
    if (isComplete) return <CheckCircle2 className="h-4 w-4" />;
    if (isThinking) return <Loader2 className="h-4 w-4 animate-spin" />;
    return <Bot className="h-4 w-4" />;
  };

  const getBubbleStyle = () => {
    if (isUser) return "bg-primary text-primary-foreground ml-auto";
    if (isError) return "bg-destructive/10 border-destructive/20 text-destructive";
    if (isThinking) return "bg-muted/50 border-muted text-muted-foreground italic";
    if (isToolUse) return "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300";
    if (isToolResult) return "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300";
    if (isStatus) return "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300";
    if (isComplete) return "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300";
    return "bg-card border text-card-foreground";
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Don't show complete messages in the UI
  if (isComplete) return null;

  return (
    <div className={cn(
      "flex gap-2 max-w-[85%]",
      isUser ? "ml-auto flex-row-reverse" : "mr-auto"
    )}>
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        {getIcon()}
      </div>
      
      <div className="flex flex-col gap-1">
        <div className={cn(
          "rounded-lg px-4 py-2 border",
          getBubbleStyle()
        )}>
          {isToolUse && message.metadata?.toolName && (
            <div className="text-xs font-medium mb-1 opacity-70">
              Tool: {message.metadata.toolName}
            </div>
          )}
          
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          
          {isToolUse && message.metadata?.toolInput && (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer opacity-70 hover:opacity-100">
                View input
              </summary>
              <pre className="text-xs mt-1 p-2 bg-black/10 rounded overflow-x-auto">
                {JSON.stringify(message.metadata.toolInput, null, 2)}
              </pre>
            </details>
          )}
          
          {isToolResult && message.metadata?.toolResult && (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer opacity-70 hover:opacity-100">
                View result
              </summary>
              <pre className="text-xs mt-1 p-2 bg-black/10 rounded overflow-x-auto max-h-32">
                {typeof message.metadata.toolResult === 'string' 
                  ? message.metadata.toolResult 
                  : JSON.stringify(message.metadata.toolResult, null, 2)}
              </pre>
            </details>
          )}
          
          {isStatus && message.metadata?.progress !== undefined && (
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Progress</span>
                <span>{message.metadata.progress}%</span>
              </div>
              <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${message.metadata.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        <span className={cn(
          "text-[10px] text-muted-foreground px-1",
          isUser ? "text-right" : "text-left"
        )}>
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}

