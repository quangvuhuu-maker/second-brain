"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

export function AdhocTaskWidget() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError("");
    setResponse("");
    
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResponse(data.result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="col-span-3 flex flex-col bg-primary/5 border-primary/20 hover:shadow-md transition-all shadow-sm h-[400px]">
      <CardHeader>
        <CardTitle>Ad-hoc Tasks</CardTitle>
        <CardDescription>
          Ask Gemini to do anything for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between overflow-hidden pb-4">
        {response ? (
           <div className="flex-1 mb-4 p-4 bg-background/80 rounded-md border text-sm overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
             {response}
           </div>
        ) : error ? (
           <div className="flex-1 mb-4 p-4 bg-destructive/10 text-destructive rounded-md border border-destructive/20 text-sm overflow-y-auto">
             <p className="font-semibold mb-1">Error:</p>
             {error}
           </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 flex-1 flex flex-col">
            <Textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Lên kế hoạch đi Đà Lạt 3 ngày 2 đêm với ngân sách 5 triệu..."
              className="flex-1 min-h-[160px] resize-none bg-background/50 focus-visible:ring-primary border-primary/10 shadow-inner"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Button type="submit" disabled={isLoading || !prompt.trim()} className="w-full font-semibold shadow-md">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {isLoading ? "Thinking..." : "Ask Agent"}
            </Button>
          </form>
        )}

        {(response || error) && (
          <Button variant="outline" className="w-full mt-2 border-primary/20 hover:bg-primary/10" onClick={() => { setResponse(""); setError(""); setPrompt(""); }}>
            New Task
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
