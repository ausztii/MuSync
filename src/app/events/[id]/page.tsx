"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, getDoc, orderBy, updateDoc } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Link as LinkIcon, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function EventDetailsPage() {
  const { user, userData, loading } = useAuth();
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [event, setEvent] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [designer, setDesigner] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!id) return;

    const unsubEvent = onSnapshot(doc(db, "events", id), async (docSnap) => {
      if (docSnap.exists()) {
        const eventData = docSnap.data();
        setEvent({ id: docSnap.id, ...eventData });

        if (eventData.assignedDesignerId) {
          const userDoc = await getDoc(doc(db, "users", eventData.assignedDesignerId));
          if (userDoc.exists()) setDesigner(userDoc.data());
        } else {
          setDesigner(null);
        }
      }
    });

    const unsubComments = onSnapshot(
      query(collection(db, `events/${id}/comments`), orderBy("createdAt", "asc")),
      (snapshot) => {
        setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    return () => {
      unsubEvent();
      unsubComments();
    };
  }, [id]);

  const handlePostComment = async (isStatusUpdate = false) => {
    if (!newComment.trim()) return;
    try {
      await addDoc(collection(db, `events/${id}/comments`), {
        authorId: user?.uid,
        authorName: userData?.name || "Unknown",
        authorRole: userData?.role || "UNKNOWN",
        text: newComment,
        isStatusUpdate,
        createdAt: serverTimestamp(),
      });
      if (isStatusUpdate) {
        await updateDoc(doc(db, "events", id), {
          latestStatusUpdate: newComment,
          latestStatusUpdateAt: serverTimestamp(),
        });
      }
      setNewComment("");
    } catch (error: any) {
      toast.error("Failed to post: " + error.message);
    }
  };

  const generateRequirementsLink = () => {
    const origin = typeof window !== "undefined" && window.location.origin ? window.location.origin : "";
    const url = `${origin}/events/${id}/requirements-form`;
    navigator.clipboard.writeText(url);
    toast.success("Requirements form link copied to clipboard!");
  };

  if (loading || !event) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  const canGenerateLink = event.status !== "UNASSIGNED" && (userData?.role === "LEAD" || event.assignedDesignerId === user?.uid);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-zinc-200 bg-white/80 px-6 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{event.name}</h1>
        </div>
        {canGenerateLink && (
          <Button variant="outline" size="sm" onClick={generateRequirementsLink} className="gap-2">
            <LinkIcon className="h-4 w-4" />
            Share Prompt Link
          </Button>
        )}
      </header>

      <main className="flex-1 overflow-auto p-6 md:p-12">
        <div className="mx-auto max-w-5xl grid gap-8 md:grid-cols-[1fr_350px]">
          
          <div className="space-y-6 flex flex-col h-[calc(100vh-140px)]">
            <Card className="flex-1 flex flex-col overflow-hidden shadow-sm">
              <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                <CardTitle>Discussion & Updates</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {comments.length === 0 && (
                  <div className="flex h-full items-center justify-center text-zinc-400">
                    No updates yet. Start the conversation!
                  </div>
                )}
                {comments.map((comment) => {
                  const isMe = comment.authorId === user?.uid;
                  return (
                    <div key={comment.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                      <Avatar className="h-8 w-8 mt-1">
                        <AvatarFallback className="text-xs bg-indigo-100 text-indigo-700">
                          {comment.authorName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[75%]`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-zinc-500">{comment.authorName}</span>
                          <span className="text-[10px] text-zinc-400">
                            {comment.createdAt ? new Date(comment.createdAt.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}
                          </span>
                        </div>
                        <div className={`px-4 py-2 rounded-2xl ${
                          comment.isStatusUpdate 
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50" 
                            : isMe 
                              ? "bg-indigo-600 text-white" 
                              : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        }`}>
                          {comment.isStatusUpdate && <span className="block text-[10px] font-bold uppercase opacity-70 mb-1">Status Update</span>}
                          <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
              <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                <div className="flex gap-2">
                  <Textarea 
                    placeholder="Type a message..." 
                    className="min-h-[44px] max-h-32 resize-none"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handlePostComment(false);
                      }
                    }}
                  />
                  <div className="flex flex-col gap-2">
                    <Button size="icon" className="bg-indigo-600 hover:bg-indigo-700 h-11 w-11" onClick={() => handlePostComment(false)}>
                      <Send className="h-5 w-5" />
                    </Button>
                    {userData?.role === "DESIGNER" && (
                      <Button size="sm" variant="outline" className="text-xs border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-400" onClick={() => handlePostComment(true)}>
                        Update Status
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Event Details</CardTitle>
                <CardDescription>Basic information and context</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-zinc-500 mb-1">Status</h4>
                  <Badge variant="outline" className="bg-zinc-100 dark:bg-zinc-800">{event.status.replace("_", " ")}</Badge>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-zinc-500 mb-1">Date</h4>
                  <p className="text-sm">{new Date(event.date).toLocaleDateString()}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-zinc-500 mb-1">Description</h4>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{event.oneLiner}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-zinc-500 mb-1">Assigned To</h4>
                  {designer ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-pink-100 text-pink-700">{designer.name[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{designer.name}</span>
                    </div>
                  ) : (
                    <span className="text-sm italic text-zinc-400">Unassigned</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Requirements</CardTitle>
              </CardHeader>
              <CardContent>
                {event.requirements ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-zinc-500 mb-1">Posters Needed</h4>
                      <div className="flex flex-wrap gap-2">
                        {event.requirements.posters.map((p: string, i: number) => (
                          <Badge key={i} variant="secondary">{p}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-zinc-500 mb-1">Context / Details</h4>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{event.requirements.context}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-zinc-500">
                    <p className="text-sm mb-4">No requirements submitted yet.</p>
                    {canGenerateLink && (
                      <Button variant="outline" size="sm" onClick={generateRequirementsLink} className="w-full">
                        Copy Requirements Link
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
        </div>
      </main>
    </div>
  );
}
