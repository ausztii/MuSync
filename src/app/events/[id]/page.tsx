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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Link as LinkIcon, ArrowLeft, X } from "lucide-react";
import Link from "next/link";

export default function EventDetailsPage() {
  const { user, userData, loading } = useAuth();
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [event, setEvent] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [designers, setDesigners] = useState<any[]>([]);
  const [allDesigners, setAllDesigners] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    if (userData?.role === "LEAD") {
      const unsub = onSnapshot(query(collection(db, "users")), (snapshot) => {
        setAllDesigners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((u: any) => u.role === "DESIGNER"));
      });
      return () => unsub();
    }
  }, [user, userData]);

  useEffect(() => {
    if (!id) return;

    const unsubEvent = onSnapshot(doc(db, "events", id), async (docSnap) => {
      if (docSnap.exists()) {
        const eventData = docSnap.data();
        setEvent({ id: docSnap.id, ...eventData });

        const dIds = eventData.assignedDesignerIds || [];
        if (eventData.assignedDesignerId && !dIds.includes(eventData.assignedDesignerId)) {
          dIds.push(eventData.assignedDesignerId);
        }

        if (dIds.length > 0) {
          const docs = await Promise.all(dIds.map((dId: string) => getDoc(doc(db, "users", dId))));
          setDesigners(docs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })));
        } else {
          setDesigners([]);
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

  const handleAssignAdditionalDesigner = async (designerId: string) => {
    if (!designerId) return;
    try {
      const currentIds = event.assignedDesignerIds || [];
      if (event.assignedDesignerId && !currentIds.includes(event.assignedDesignerId)) {
        currentIds.push(event.assignedDesignerId);
      }
      if (currentIds.includes(designerId)) {
        toast.error("Designer already assigned");
        return;
      }

      await updateDoc(doc(db, "events", id), {
        status: "PENDING_CONFIRMATION",
        assignedDesignerIds: [...currentIds, designerId],
      });
      await addDoc(collection(db, "requests"), {
        eventId: id,
        designerId,
        type: "LEAD_ASSIGNMENT",
        status: "PENDING",
        createdAt: serverTimestamp(),
      });
      toast.success("Assignment request sent to designer");
    } catch (error: any) {
      toast.error("Failed to assign designer: " + error.message);
    }
  };

  const handleRemoveDesigner = async (designerId: string) => {
    if (!confirm("Are you sure you want to remove this designer from the event?")) return;
    try {
      const currentIds = event.assignedDesignerIds || [];
      if (event.assignedDesignerId && !currentIds.includes(event.assignedDesignerId)) {
        currentIds.push(event.assignedDesignerId);
      }
      const newIds = currentIds.filter((dId: string) => dId !== designerId);
      
      const updateData: any = {
        assignedDesignerIds: newIds,
      };
      
      if (event.assignedDesignerId === designerId) {
        updateData.assignedDesignerId = null;
      }
      
      if (newIds.length === 0 && !updateData.assignedDesignerId && (event.status === "IN_PROGRESS" || event.status === "PENDING_CONFIRMATION")) {
        updateData.status = "UNASSIGNED";
      }

      await updateDoc(doc(db, "events", id), updateData);
      
      await updateDoc(doc(db, "users", designerId), {
        status: "FREE",
      });

      toast.success("Designer removed from event");
    } catch (error: any) {
      toast.error("Failed to remove designer: " + error.message);
    }
  };

  const togglePosterCompletion = async (poster: string) => {
    try {
      const completed = event.requirements.completedPosters || [];
      const newCompleted = completed.includes(poster)
        ? completed.filter((p: string) => p !== poster)
        : [...completed, poster];

      await updateDoc(doc(db, "events", id), {
        "requirements.completedPosters": newCompleted
      });
    } catch (error: any) {
      toast.error("Failed to update poster status: " + error.message);
    }
  };

  if (loading || !event) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  const canGenerateLink = event.status !== "UNASSIGNED" && (userData?.role === "LEAD" || (event.assignedDesignerIds || []).includes(user?.uid) || event.assignedDesignerId === user?.uid);

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
            Share Requirement Request Link
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
                            {comment.createdAt ? new Date(comment.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                          </span>
                        </div>
                        <div className={`px-4 py-2 rounded-2xl ${comment.isStatusUpdate
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
                  {designers.length > 0 ? (
                    <div className="flex flex-col gap-2 mt-1">
                      {designers.map((d, i) => (
                        <div key={i} className="flex items-center justify-between p-1 -mx-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px] bg-pink-100 text-pink-700">{d.name[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{d.name}</span>
                          </div>
                          {userData?.role === "LEAD" && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-red-500" onClick={() => handleRemoveDesigner(d.id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm italic text-zinc-400">Unassigned</span>
                  )}
                  {userData?.role === "LEAD" && (
                    <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                      <h4 className="text-sm font-medium text-zinc-500 mb-2">Assign Additional Designer</h4>
                      <Select onValueChange={(val) => handleAssignAdditionalDesigner(val)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select a designer" />
                        </SelectTrigger>
                        <SelectContent>
                          {allDesigners.filter(d => !designers.find(existing => existing.id === d.id)).map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                      <div className="flex flex-col gap-3 mt-2">
                        {event.requirements.posters.map((p: string, i: number) => (
                          <div key={i} className="flex items-center space-x-2">
                            <Checkbox
                              id={`poster-${i}`}
                              checked={(event.requirements.completedPosters || []).includes(p)}
                              onCheckedChange={() => togglePosterCompletion(p)}
                            />
                            <label
                              htmlFor={`poster-${i}`}
                              className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${(event.requirements.completedPosters || []).includes(p) ? "line-through text-zinc-400" : ""
                                }`}
                            >
                              {p}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                    {event.requirements.expectedDate && (
                      <div>
                        <h4 className="text-sm font-medium text-zinc-500 mb-1">Expected Date</h4>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{new Date(event.requirements.expectedDate).toLocaleDateString()}</p>
                      </div>
                    )}
                    <div>
                      <h4 className="text-sm font-medium text-zinc-500 mb-1">Context / Details</h4>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{event.requirements.context}</p>
                    </div>
                    {event.requirements.contactInfo && (
                      <div>
                        <h4 className="text-sm font-medium text-zinc-500 mb-1">Contact Information</h4>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{event.requirements.contactInfo}</p>
                      </div>
                    )}
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
