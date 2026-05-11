"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, Loader2, Plus, Trash2, CheckCircle2, Circle, Clock } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useTasks, Task, TaskStatus } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppLayout } from "@/components/layout/AppLayout";

export default function TasksPage() {
  const { tasks, isLoaded, addTask, addMessageToTask, updateTaskStatus, deleteTask } = useTasks();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeTask = tasks.find((t) => t.id === activeTaskId);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeTask?.messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    const currentPrompt = prompt;
    setPrompt(""); // Clear input early for better UX
    setIsLoading(true);
    
    let currentTaskId = activeTaskId;

    // If starting a new task
    if (!currentTaskId) {
      // Generate a short title from prompt (max 30 chars)
      const title = currentPrompt.length > 30 ? currentPrompt.substring(0, 30) + "..." : currentPrompt;
      currentTaskId = addTask(title, { role: "user", content: currentPrompt });
      setActiveTaskId(currentTaskId);
    } else {
      addMessageToTask(currentTaskId, { role: "user", content: currentPrompt });
    }

    try {
      const history = currentTaskId === activeTaskId && activeTask 
        ? [...activeTask.messages, { role: "user", content: currentPrompt }]
        : [{ role: "user", content: currentPrompt }];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }), // Send full history
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      addMessageToTask(currentTaskId, { role: "ai", content: data.result });
    } catch (err: any) {
      addMessageToTask(currentTaskId!, { role: "ai", content: "Lỗi hệ thống: " + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case "completed": 
        return <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1"/> Completed</Badge>;
      case "pending": 
        return <Badge variant="secondary" className="bg-amber-500/20 text-amber-600 hover:bg-amber-500/30"><Clock className="w-3 h-3 mr-1"/> Pending</Badge>;
      case "not_started": 
        return <Badge variant="outline" className="text-muted-foreground"><Circle className="w-3 h-3 mr-1"/> Not Started</Badge>;
      default:
        return null;
    }
  };

  return (
    <React.Fragment>
      <div className="flex flex-col gap-6 animate-in fade-in duration-500 h-[calc(100vh-6rem)]">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Task Manager</h1>
          <p className="text-muted-foreground mt-1">Manage your Ad-hoc tasks and collaborate with AI.</p>
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
          
          {/* LEFT COLUMN: TASK LIST */}
          <Card className="w-[300px] shrink-0 border-none shadow-sm bg-card hidden md:flex flex-col">
            <div className="p-4 border-b">
              <Button onClick={() => setActiveTaskId(null)} className="w-full" variant="outline">
                <Plus className="w-4 h-4 mr-2" /> New Task
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 flex flex-col gap-1">
                {!isLoaded && <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>}
                {isLoaded && tasks.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground italic">
                    No tasks yet. Create one!
                  </div>
                )}
                {tasks.map((task) => (
                  <div 
                    key={task.id}
                    onClick={() => setActiveTaskId(task.id)}
                    className={`group relative p-3 rounded-lg cursor-pointer transition-all hover:bg-muted/50 border ${activeTaskId === task.id ? 'bg-muted border-primary/20' : 'border-transparent'}`}
                  >
                    <div className="font-medium text-sm truncate pr-8">{task.title}</div>
                    <div className="mt-2 flex items-center justify-between">
                      {getStatusBadge(task.status)}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        deleteTask(task.id); 
                        if(activeTaskId === task.id) setActiveTaskId(null); 
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>

          {/* RIGHT COLUMN: CHAT INTERFACE */}
          <Card className="flex-1 border-none shadow-sm bg-card flex flex-col min-w-0">
            {activeTaskId && activeTask ? (
              <React.Fragment>
                <CardHeader className="border-b bg-muted/20 py-4 flex flex-row items-center justify-between space-y-0">
                  <div className="flex-1 min-w-0 mr-4">
                    <CardTitle className="text-lg truncate">{activeTask.title}</CardTitle>
                    <CardDescription className="truncate mt-1">
                      {activeTask.messages.length} messages
                    </CardDescription>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Select 
                      value={activeTask.status} 
                      onValueChange={(val) => {
                        if (val) updateTaskStatus(activeTask.id, val as TaskStatus);
                      }}
                    >
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_started">Not Started</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
                  <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTask.messages.map((msg, idx) => (
                      <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'ai' ? 'bg-primary/10' : 'bg-muted'}`}>
                          {msg.role === 'ai' ? <Bot className="h-4 w-4 text-primary" /> : <div className="h-4 w-4 rounded-full bg-foreground/20" />}
                        </div>
                        <div className={`border p-4 text-sm leading-relaxed whitespace-pre-wrap max-w-[85%] ${
                          msg.role === 'ai' 
                            ? 'bg-muted/30 rounded-2xl rounded-tl-sm text-foreground' 
                            : 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm border-primary'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    
                    {isLoading && (
                      <div className="flex gap-4">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="bg-muted/30 border rounded-2xl rounded-tl-sm p-4 flex items-center gap-3 text-muted-foreground text-sm">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          Processing...
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <CardHeader className="border-b bg-muted/20">
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    Start a New Task
                  </CardTitle>
                  <CardDescription>Enter a prompt below to create a new task and start a conversation.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex items-center justify-center">
                   <div className="flex flex-col items-center justify-center text-muted-foreground space-y-4">
                    <Bot className="h-12 w-12 opacity-20" />
                    <p className="italic">Send a message to start a new task...</p>
                  </div>
                </CardContent>
              </React.Fragment>
            )}

            <Separator />
            
            <div className="p-4 bg-muted/10 rounded-b-xl">
              <form onSubmit={handleSubmit} className="flex gap-4 items-end">
                <Textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ví dụ: Dịch giúp tôi đoạn văn này..."
                  className="flex-1 min-h-[60px] max-h-[200px] resize-none bg-background focus-visible:ring-primary shadow-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <Button type="submit" disabled={isLoading || !prompt.trim()} className="h-[60px] px-8 font-medium shadow-md">
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <div className="flex items-center">
                      <Send className="mr-2 h-4 w-4" />
                      Send
                    </div>
                  )}
                </Button>
              </form>
            </div>
          </Card>

        </div>
      </div>
    </React.Fragment>
  );
}
