"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, where } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Check, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function DesignerDashboard() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  const [events, setEvents] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [denyReason, setDenyReason] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || userData?.role !== "DESIGNER")) {
      router.push("/login");
    }
  }, [user, userData, loading, router]);

  useEffect(() => {
    if (!user) return;

    const unsubscribeEvents = onSnapshot(query(collection(db, "events")), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEvents(data);
    });

    const unsubscribeRequests = onSnapshot(query(collection(db, "requests"), where("designerId", "==", user.uid)), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(data);
    });

    return () => {
      unsubscribeEvents();
      unsubscribeRequests();
    };
  }, [user]);

  const handleRequestEvent = async (eventId: string) => {
    try {
      await addDoc(collection(db, "requests"), {
        eventId,
        designerId: user?.uid,
        type: "DESIGNER_REQUEST",
        status: "PENDING",
        createdAt: serverTimestamp(),
      });
      toast.success("Requested event successfully");
    } catch (error: any) {
      toast.error("Failed to request event: " + error.message);
    }
  };

  const handleRespondRequest = async (requestId: string, eventId: string, status: "APPROVED" | "DENIED") => {
    try {
      await updateDoc(doc(db, "requests", requestId), {
        status,
        reason: status === "DENIED" ? denyReason : null,
      });

      if (status === "APPROVED") {
        const eventToUpdate = events.find(e => e.id === eventId);
        const currentIds = eventToUpdate?.assignedDesignerIds || [];
        if (eventToUpdate?.assignedDesignerId && !currentIds.includes(eventToUpdate.assignedDesignerId)) {
          currentIds.push(eventToUpdate.assignedDesignerId);
        }
        await updateDoc(doc(db, "events", eventId), {
          assignedDesignerIds: currentIds.includes(user?.uid) ? currentIds : [...currentIds, user?.uid],
          status: "IN_PROGRESS",
        });
        await updateDoc(doc(db, "users", user!.uid), {
          status: "WORKING",
        });
      } else {
        const eventToUpdate = events.find(e => e.id === eventId);
        let currentIds = eventToUpdate?.assignedDesignerIds || [];
        if (eventToUpdate?.assignedDesignerId && !currentIds.includes(eventToUpdate.assignedDesignerId)) {
          currentIds.push(eventToUpdate.assignedDesignerId);
        }
        currentIds = currentIds.filter((id: string) => id !== user?.uid);
        await updateDoc(doc(db, "events", eventId), {
          assignedDesignerIds: currentIds,
          status: currentIds.length > 0 ? "IN_PROGRESS" : "UNASSIGNED",
        });
      }

      toast.success(`Request ${status.toLowerCase()}`);
      setSelectedRequestId(null);
      setDenyReason("");
    } catch (error: any) {
      toast.error("Failed to respond: " + error.message);
    }
  };

  if (loading || !userData) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  const myEvents = events.filter(e => (e.assignedDesignerIds || []).includes(user?.uid) || e.assignedDesignerId === user?.uid);
  const unassignedEvents = events.filter(e => e.status === "UNASSIGNED");
  const pendingRequests = requests.filter(r => r.status === "PENDING" && r.type === "LEAD_ASSIGNMENT");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 md:p-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Designer Dashboard</h1>
          <p className="text-zinc-500 mt-2">Welcome back, {userData.name}. You are currently <Badge variant={userData.status === "FREE" ? "secondary" : "destructive"}>{userData.status}</Badge></p>
        </div>
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarFallback className="bg-gradient-to-br from-pink-400 to-rose-500 text-white">{userData.name[0]}</AvatarFallback>
          </Avatar>
          <Button variant="outline" size="icon" onClick={() => signOut(auth).then(() => router.push("/login"))}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <Tabs defaultValue="my-tasks" className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="my-tasks">My Tasks ({myEvents.length})</TabsTrigger>
          <TabsTrigger value="requests">Incoming Requests {pendingRequests.length > 0 && <Badge className="ml-2 bg-rose-500">{pendingRequests.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="unassigned">Open Events</TabsTrigger>
        </TabsList>

        <TabsContent value="my-tasks" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {myEvents.map(event => (
              <Card key={event.id} className="border-indigo-100 dark:border-indigo-900/50 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => router.push(`/events/${event.id}`)}>
                <CardHeader>
                  <CardTitle className="text-xl text-indigo-700 dark:text-indigo-400">{event.name}</CardTitle>
                  <CardDescription>{new Date(event.date).toLocaleDateString()}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{event.oneLiner}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-800">
                      {event.status.replace("_", " ")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            {myEvents.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-500 border-2 border-dashed rounded-lg border-zinc-200 dark:border-zinc-800">
                You have no active tasks. Look at open events to request work!
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {pendingRequests.map(req => {
              const event = events.find(e => e.id === req.eventId);
              if (!event) return null;
              return (
                <Card key={req.id}>
                  <CardHeader>
                    <CardTitle>Assignment Request: {event.name}</CardTitle>
                    <CardDescription>A Lead has requested you to work on this event.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-600 mb-4">{event.oneLiner}</p>
                    <div className="flex gap-2 w-full">
                      <Button onClick={() => handleRespondRequest(req.id, event.id, "APPROVED")} className="bg-emerald-600 hover:bg-emerald-700 flex-1 flex items-center justify-center gap-2">
                        <Check className="h-4 w-4" /> Accept
                      </Button>

                      <Dialog open={selectedRequestId === req.id} onOpenChange={(open) => !open && setSelectedRequestId(null)}>
                        <DialogTrigger render={<Button variant="destructive" className="flex-1 flex items-center justify-center gap-2" onClick={() => setSelectedRequestId(req.id)} />}>
                          <X className="h-4 w-4" /> Deny
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Decline Assignment</DialogTitle>
                          </DialogHeader>
                          <div className="py-4">
                            <Label>Reason for denying</Label>
                            <Textarea
                              placeholder="I am currently overloaded with exams..."
                              value={denyReason}
                              onChange={(e) => setDenyReason(e.target.value)}
                              className="mt-2"
                            />
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setSelectedRequestId(null)}>Cancel</Button>
                            <Button variant="destructive" onClick={() => handleRespondRequest(req.id, event.id, "DENIED")} disabled={!denyReason.trim()}>
                              Confirm Denial
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {pendingRequests.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-500 border-2 border-dashed rounded-lg border-zinc-200 dark:border-zinc-800">
                No pending assignment requests.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="unassigned" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {unassignedEvents.map(event => {
              const hasRequested = requests.some(r => r.eventId === event.id && r.type === "DESIGNER_REQUEST" && r.status === "PENDING");
              const deniedRequest = requests.find(r => r.eventId === event.id && r.type === "DESIGNER_REQUEST" && r.status === "DENIED");
              return (
                <Card key={event.id}>
                  <CardHeader>
                    <CardTitle>{event.name}</CardTitle>
                    <CardDescription>{new Date(event.date).toLocaleDateString()}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-600 mb-4">{event.oneLiner}</p>
                    {deniedRequest && (
                      <div className="mb-4 rounded-md bg-rose-50 dark:bg-rose-950/40 p-3 border border-rose-200 dark:border-rose-900/50">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-500 mb-1">Request Denied</p>
                        <p className="text-xs text-rose-900 dark:text-rose-200">Reason: {deniedRequest.reason}</p>
                      </div>
                    )}
                    <Button
                      className="w-full"
                      variant={hasRequested ? "secondary" : "default"}
                      disabled={hasRequested || !!deniedRequest}
                      onClick={() => handleRequestEvent(event.id)}
                    >
                      {hasRequested ? "Request Pending" : deniedRequest ? "Request Denied" : "Request to Work"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {unassignedEvents.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-500 border-2 border-dashed rounded-lg border-zinc-200 dark:border-zinc-800">
                All events are currently assigned!
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
