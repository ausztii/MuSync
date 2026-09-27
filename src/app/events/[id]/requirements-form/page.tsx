"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

const POSTER_TYPES = [
  { id: "coming-soon", label: "Coming Soon" },
  { id: "guest-reveal", label: "Guest Reveal" },
  { id: "registration", label: "Registration" },
  { id: "culturals", label: "Culturals" },
  { id: "certificates", label: "Certificates" },
  { id: "id-cards", label: "ID Cards" },
];

export default function RequirementsFormPage() {
  const { id } = useParams() as { id: string };
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [selectedPosters, setSelectedPosters] = useState<string[]>([]);
  const [context, setContext] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [expectedDate, setExpectedDate] = useState("");

  useEffect(() => {
    if (!id) return;
    const fetchEvent = async () => {
      try {
        const docSnap = await getDoc(doc(db, "events", id));
        if (docSnap.exists()) {
          setEvent({ id: docSnap.id, ...docSnap.data() });
          if (docSnap.data().requirements) {
            setSubmitted(true);
          }
        }
      } catch (error) {
        console.error("Error fetching event:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [id]);

  const togglePoster = (posterId: string) => {
    setSelectedPosters(prev => 
      prev.includes(posterId) ? prev.filter(p => p !== posterId) : [...prev, posterId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPosters.length === 0) {
      toast.error("Please select at least one poster requirement.");
      return;
    }
    if (!context.trim()) {
      toast.error("Please provide context for the design.");
      return;
    }

    setSubmitting(true);
    try {
      await updateDoc(doc(db, "events", id), {
        requirements: {
          posters: selectedPosters.map(pid => POSTER_TYPES.find(p => p.id === pid)?.label),
          context,
          contactInfo,
          expectedDate,
          submittedAt: new Date().toISOString(),
        }
      });
      setSubmitted(true);
      toast.success("Requirements submitted successfully!");
    } catch (error: any) {
      toast.error("Error submitting requirements: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading event details...</div>;
  if (!event) return <div className="flex h-screen items-center justify-center text-red-500">Event not found.</div>;

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
        <Card className="w-full max-w-lg shadow-lg border-emerald-200 dark:border-emerald-900 bg-white dark:bg-zinc-900">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <CardTitle className="text-2xl">Requirements Submitted</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-zinc-500 pb-8">
            Thank you for submitting the requirements for <strong>{event.name}</strong>. The design team has been notified.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4 sm:px-6 lg:px-8 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Design Requirements Form</h1>
          <p className="mt-2 text-zinc-500">Please provide all necessary details for the design team.</p>
        </div>

        <Card className="shadow-lg border-zinc-200 dark:border-zinc-800">
          <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-zinc-100 dark:border-zinc-800">
            <CardTitle className="text-xl text-indigo-700 dark:text-indigo-400">{event.name}</CardTitle>
            <CardDescription>{event.oneLiner} • {new Date(event.date).toLocaleDateString()}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-8">
              
              <div className="space-y-4">
                <Label className="text-base">What do you need designed?</Label>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {POSTER_TYPES.map((type) => (
                    <div key={type.id} className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                      <Checkbox 
                        id={type.id} 
                        checked={selectedPosters.includes(type.id)}
                        onCheckedChange={() => togglePoster(type.id)}
                      />
                      <div className="space-y-1 leading-none">
                        <Label htmlFor={type.id} className="font-medium cursor-pointer">
                          {type.label}
                        </Label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="context" className="text-base">Design Context & Details <span className="text-red-500">*</span></Label>
                <p className="text-sm text-zinc-500">Include themes, colors, text content, logos needed, references, etc.</p>
                <Textarea
                  id="context"
                  required
                  placeholder="The theme is 'Cyberpunk'. Please include the main sponsor logo in the bottom right..."
                  className="min-h-[150px]"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="expectedDate" className="text-base">Expected Date to Receive Posters <span className="text-red-500">*</span></Label>
                <Input
                  id="expectedDate"
                  type="date"
                  required
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="contact" className="text-base">Contact Information</Label>
                <p className="text-sm text-zinc-500">How should the designer reach you for quick questions?</p>
                <Input
                  id="contact"
                  placeholder="Your Name (Phone Number or Email)"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-lg" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Requirements"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
