"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export default function LeadDashboard() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  const [designers, setDesigners] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  const [newEvent, setNewEvent] = useState({ name: "", date: "", oneLiner: "", designerId: "" });
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("Requirement already satisfied");
  const [selectedRejectRequestId, setSelectedRejectRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || userData?.role !== "LEAD")) {
      router.push("/login");
    }
  }, [user, userData, loading, router]);

  useEffect(() => {
    if (!user) return;

    const unsubscribeDesigners = onSnapshot(query(collection(db, "users")), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((u: any) => u.role === "DESIGNER");
      setDesigners(data);
    });

    const unsubscribeEvents = onSnapshot(query(collection(db, "events")), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEvents(data);
    });

    const unsubscribeRequests = onSnapshot(query(collection(db, "requests")), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(data);
    });

    return () => {
      unsubscribeDesigners();
      unsubscribeEvents();
      unsubscribeRequests();
    };
  }, [user]);

  const handleCreateEvent = async () => {
    if (!newEvent.name || !newEvent.date || !newEvent.oneLiner) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      const eventRef = await addDoc(collection(db, "events"), {
        name: newEvent.name,
        date: newEvent.date,
        oneLiner: newEvent.oneLiner,
        status: newEvent.designerId ? "PENDING_CONFIRMATION" : "UNASSIGNED",
        assignedDesignerId: newEvent.designerId || null,
        isHidden: false,
        createdAt: serverTimestamp(),
      });

      if (newEvent.designerId) {
        await addDoc(collection(db, "requests"), {
          eventId: eventRef.id,
          designerId: newEvent.designerId,
          type: "LEAD_ASSIGNMENT",
          status: "PENDING",
          createdAt: serverTimestamp(),
        });
      }

      toast.success("Event created successfully");
      setIsEventModalOpen(false);
      setNewEvent({ name: "", date: "", oneLiner: "", designerId: "" });
    } catch (error: any) {
      toast.error("Error creating event: " + error.message);
    }
  };

  const handleAssignDesigner = async (eventId: string, designerId: string) => {
    if (!designerId || designerId === "none") return;
    try {
      const eventToUpdate = events.find(e => e.id === eventId);
      const currentIds = eventToUpdate?.assignedDesignerIds || [];
      if (eventToUpdate?.assignedDesignerId && !currentIds.includes(eventToUpdate.assignedDesignerId)) {
        currentIds.push(eventToUpdate.assignedDesignerId);
      }
      if (currentIds.includes(designerId)) {
        toast.error("Designer already assigned or requested");
        return;
      }
      await updateDoc(doc(db, "events", eventId), {
        status: "PENDING_CONFIRMATION",
        assignedDesignerIds: [...currentIds, designerId],
      });
      await addDoc(collection(db, "requests"), {
        eventId,
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

  const handleToggleVisibility = async (eventId: string, currentHidden: boolean) => {
    try {
      await updateDoc(doc(db, "events", eventId), {
        isHidden: !currentHidden,
      });
      toast.success(`Event is now ${!currentHidden ? "hidden" : "visible"}`);
    } catch (error: any) {
      toast.error("Failed to toggle visibility: " + error.message);
    }
  };

  const handleCancelEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to cancel this event?")) return;
    try {
      await updateDoc(doc(db, "events", eventId), {
        status: "CANCELLED",
      });
      toast.success("Event cancelled");
    } catch (error: any) {
      toast.error("Failed to cancel event: " + error.message);
    }
  };

  const handleCompleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to mark this event as completed?")) return;
    try {
      const eventToComplete = events.find(e => e.id === eventId);
      await updateDoc(doc(db, "events", eventId), {
        status: "COMPLETED",
      });
      
      const designerIds = eventToComplete?.assignedDesignerIds || [];
      if (eventToComplete?.assignedDesignerId && !designerIds.includes(eventToComplete.assignedDesignerId)) {
        designerIds.push(eventToComplete.assignedDesignerId);
      }
      
      for (const dId of designerIds) {
        await updateDoc(doc(db, "users", dId), {
          status: "FREE",
        });
      }

      toast.success("Event marked as completed");
    } catch (error: any) {
      toast.error("Failed to complete event: " + error.message);
    }
  };

  const handleRequestStatusUpdate = async (eventId: string) => {
    try {
      await addDoc(collection(db, `events/${eventId}/comments`), {
        authorId: user?.uid,
        authorName: userData?.name || "Lead",
        authorRole: "LEAD",
        text: "Please provide a status update on this event.",
        isStatusUpdate: false,
        isStatusRequest: true,
        createdAt: serverTimestamp(),
      });
      toast.success("Status update requested");
    } catch (error: any) {
      toast.error("Failed to request update: " + error.message);
    }
  };

  const handleRespondToDesignerRequest = async (requestId: string, eventId: string, designerId: string, status: "APPROVED" | "DENIED", reason?: string) => {
    try {
      await updateDoc(doc(db, "requests", requestId), {
        status,
        ...(reason && { reason }),
      });

      if (status === "APPROVED") {
        const eventToUpdate = events.find(e => e.id === eventId);
        const currentIds = eventToUpdate?.assignedDesignerIds || [];
        if (eventToUpdate?.assignedDesignerId && !currentIds.includes(eventToUpdate.assignedDesignerId)) {
          currentIds.push(eventToUpdate.assignedDesignerId);
        }
        await updateDoc(doc(db, "events", eventId), {
          assignedDesignerIds: currentIds.includes(designerId) ? currentIds : [...currentIds, designerId],
          status: "IN_PROGRESS",
        });
        await updateDoc(doc(db, "users", designerId), {
          status: "WORKING",
        });
      }

      if (status === "DENIED") {
        setSelectedRejectRequestId(null);
        setRejectReason("Requirement already satisfied");
      }

      toast.success(`Request ${status.toLowerCase()}`);
    } catch (error: any) {
      toast.error("Failed to respond: " + error.message);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  const pendingRequests = requests.filter(r => r.type === "DESIGNER_REQUEST" && r.status === "PENDING");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 md:p-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Lead Dashboard</h1>
          <p className="text-zinc-500 mt-2">Manage events and designer assignments.</p>
        </div>
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarFallback className="bg-indigo-100 text-indigo-700">L</AvatarFallback>
          </Avatar>
          <Button variant="outline" size="icon" onClick={() => signOut(auth).then(() => router.push("/login"))}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <Tabs defaultValue="events" className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="events">Events Overview</TabsTrigger>
          <TabsTrigger value="requests">Incoming Requests {pendingRequests.length > 0 && <Badge className="ml-2 bg-indigo-500">{pendingRequests.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="designers">Designers</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold tracking-tight">All Events</h2>
            <Dialog open={isEventModalOpen} onOpenChange={setIsEventModalOpen}>
              <DialogTrigger render={<Button className="bg-indigo-600 hover:bg-indigo-700" />}>
                Create Event
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create New Event</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Event Name</Label>
                    <Input id="name" value={newEvent.name} onChange={e => setNewEvent({ ...newEvent, name: e.target.value })} placeholder="Tech Symposium 2026" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Event Date</Label>
                    <Input id="date" type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="oneLiner">One Liner</Label>
                    <Input id="oneLiner" value={newEvent.oneLiner} onChange={e => setNewEvent({ ...newEvent, oneLiner: e.target.value })} placeholder="A symposium for tech enthusiasts" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="designer">Assign Designer (Optional)</Label>
                    <Select onValueChange={(val: string | null) => setNewEvent({ ...newEvent, designerId: val === "none" || val === null ? "" : val })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a designer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Leave Unassigned)</SelectItem>
                        {designers.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name} ({d.status})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" onClick={handleCreateEvent} className="bg-indigo-600 hover:bg-indigo-700">Save Event</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => {
              const designer = designers.find(d => d.id === event.assignedDesignerId);
              return (
                <Card key={event.id} className={`group hover:shadow-md transition-shadow ${event.isHidden ? "opacity-60" : ""}`}>
                  <div className="cursor-pointer" onClick={() => router.push(`/events/${event.id}`)}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-xl flex items-center gap-2">
                          {event.name}
                          {event.isHidden && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                        </CardTitle>
                        <Badge variant={event.status === "UNASSIGNED" ? "secondary" : event.status === "COMPLETED" ? "default" : event.status === "CANCELLED" ? "destructive" : "outline"} className="capitalize">
                          {event.status.replace("_", " ").toLowerCase()}
                        </Badge>
                      </div>
                      <CardDescription>{new Date(event.date).toLocaleDateString()}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-zinc-500 mb-4 line-clamp-2">{event.oneLiner}</p>

                      {event.latestStatusUpdate && (
                        <div className="mb-4 rounded-md bg-amber-50 dark:bg-amber-950/40 p-3 border border-amber-200 dark:border-amber-900/50">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-500 mb-1">Latest Status</p>
                          <p className="text-xs text-amber-900 dark:text-amber-200 line-clamp-2">{event.latestStatusUpdate}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-1 mt-auto pt-2 text-sm font-medium border-t border-zinc-100 dark:border-zinc-800/50">
                        {(() => {
                          const ids = event.assignedDesignerIds || [];
                          if (event.assignedDesignerId && !ids.includes(event.assignedDesignerId)) ids.push(event.assignedDesignerId);
                          
                          if (ids.length === 0) {
                            return <span className="text-zinc-700 dark:text-zinc-300 text-xs italic">Unassigned</span>;
                          }
                          return ids.map((dId: string) => {
                            const d = designers.find(x => x.id === dId);
                            if (!d) return null;
                            return (
                              <div key={dId} className="flex items-center gap-1" title={d.name}>
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-[10px] bg-zinc-200 text-zinc-700">{d.name[0]}</AvatarFallback>
                                </Avatar>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </CardContent>
                  </div>
                  <CardFooter className="bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 p-4 grid gap-2">
                    {event.status === "UNASSIGNED" && event.status !== "CANCELLED" && (
                      <div className="flex gap-2">
                        <Select onValueChange={(val: string | null) => handleAssignDesigner(event.id, val || "")}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Assign Designer" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select...</SelectItem>
                            {designers.map(d => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleToggleVisibility(event.id, !!event.isHidden); }}>
                        {event.isHidden ? "Show" : "Hide"}
                      </Button>
                      {event.status !== "CANCELLED" && (
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleCancelEvent(event.id); }}>
                          Cancel
                        </Button>
                      )}
                      {event.status !== "CANCELLED" && event.status !== "COMPLETED" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950" onClick={(e) => { e.stopPropagation(); handleCompleteEvent(event.id); }}>
                          Mark Completed
                        </Button>
                      )}
                      {((event.assignedDesignerIds && event.assignedDesignerIds.length > 0) || event.assignedDesignerId) && event.status !== "CANCELLED" && (
                        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleRequestStatusUpdate(event.id); }}>
                          Request Update
                        </Button>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
            {events.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-500 border-2 border-dashed rounded-lg border-zinc-200 dark:border-zinc-800">
                No events found. Create one to get started.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {pendingRequests.map(req => {
              const event = events.find(e => e.id === req.eventId);
              const designer = designers.find(d => d.id === req.designerId);
              if (!event || !designer) return null;
              return (
                <Card key={req.id}>
                  <CardHeader>
                    <CardTitle>Request to work on: {event.name}</CardTitle>
                    <CardDescription>{designer.name} wants to take this event.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-600 mb-4">{event.oneLiner}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={() => handleRespondToDesignerRequest(req.id, event.id, designer.id, "APPROVED")} className="bg-emerald-600 hover:bg-emerald-700 w-full">
                        Approve
                      </Button>

                      <Dialog open={selectedRejectRequestId === req.id} onOpenChange={(open) => !open && setSelectedRejectRequestId(null)}>
                        <DialogTrigger render={<Button variant="destructive" className="w-full" onClick={() => setSelectedRejectRequestId(req.id)} />}>
                          Deny
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Reject Request</DialogTitle>
                          </DialogHeader>
                          <div className="py-4">
                            <Label>Reason for rejection</Label>
                            <Textarea
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="mt-2"
                            />
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setSelectedRejectRequestId(null)}>Cancel</Button>
                            <Button variant="destructive" onClick={() => handleRespondToDesignerRequest(req.id, event.id, designer.id, "DENIED", rejectReason)} disabled={!rejectReason.trim()}>
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
                No pending requests from designers.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="designers" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {designers.map((designer) => (
              <Card key={designer.id}>
                <CardHeader className="flex flex-row items-center gap-4">
                  <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                    <AvatarFallback className="bg-gradient-to-br from-pink-400 to-rose-500 text-white">
                      {designer.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg">{designer.name}</CardTitle>
                    <CardDescription>{designer.email}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-medium text-zinc-500">Status</span>
                    <Badge variant={designer.status === "FREE" ? "secondary" : "default"} className={designer.status === "WORKING" ? "bg-amber-500 text-white hover:bg-amber-600" : ""}>
                      {designer.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
