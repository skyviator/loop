"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const storageKey = "loop.teacher.classroom";

export function ClassroomSwitcher({
  classrooms,
  activeClassroomId,
  selectionWasExplicit,
}: {
  classrooms: Array<{ id: string; name: string }>;
  activeClassroomId: string;
  selectionWasExplicit: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const valid = new Set(classrooms.map((classroom) => classroom.id));
    if (selectionWasExplicit) {
      sessionStorage.setItem(storageKey, activeClassroomId);
      return;
    }
    const remembered = sessionStorage.getItem(storageKey);
    if (remembered && remembered !== activeClassroomId && valid.has(remembered)) {
      router.replace(`/teacher?classroom=${encodeURIComponent(remembered)}`);
    }
  }, [activeClassroomId, classrooms, router, selectionWasExplicit]);

  if (classrooms.length < 2) return null;
  return <label className="classroom-switcher">
    <span>Active classroom</span>
    <select
      aria-label="Active classroom"
      value={activeClassroomId}
      onChange={(event) => {
        const classroomId = event.currentTarget.value;
        sessionStorage.setItem(storageKey, classroomId);
        router.push(`/teacher?classroom=${encodeURIComponent(classroomId)}`);
      }}
    >
      {classrooms.map((classroom) => <option value={classroom.id} key={classroom.id}>{classroom.name}</option>)}
    </select>
  </label>;
}
