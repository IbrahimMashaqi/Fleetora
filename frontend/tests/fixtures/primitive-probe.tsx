"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PrimitiveProbe() {
  const [submissions, setSubmissions] = useState(0);
  return <main className="bg-surface p-8">
    <form onSubmit={event => { event.preventDefault(); setSubmissions(value => value + 1); }}>
      <Label htmlFor="probe-input">Probe value</Label><Input id="probe-input" />
      <Button>Local action</Button><Button type="submit">Save probe</Button>
      <Button asChild><a href="#probe-result">Probe link</a></Button>
      <Button disabled>Unavailable action</Button>
      <p id="probe-result" role="status">Submissions: {submissions}</p>
    </form>
  </main>;
}
