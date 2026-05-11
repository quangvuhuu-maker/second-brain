"use client";

import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, query, orderBy } from "firebase/firestore";

export type TaskStatus = "not_started" | "pending" | "completed";

export interface Message {
  role: "user" | "ai";
  content: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  messages: Message[];
  createdAt: number;
}

export function useTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setIsLoaded(true);
      return;
    }

    setIsLoaded(false);
    const tasksRef = collection(db, "users", user.uid, "tasks");
    const q = query(tasksRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks: Task[] = [];
      snapshot.forEach((doc) => {
        fetchedTasks.push({ id: doc.id, ...doc.data() } as Task);
      });
      setTasks(fetchedTasks);
      setIsLoaded(true);
    }, (error) => {
      console.error("Error fetching tasks from Firestore:", error);
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [user]);

  const addTask = (title: string, initialMessage: Message) => {
    if (!user) return "";
    
    const newId = uuidv4();
    const newTask: Omit<Task, "id"> = {
      title,
      status: "not_started",
      messages: [initialMessage],
      createdAt: Date.now(),
    };
    
    // Optimistic update
    setTasks((prev) => [{ id: newId, ...newTask }, ...prev]);
    
    // Save to Firestore
    const taskRef = doc(db, "users", user.uid, "tasks", newId);
    setDoc(taskRef, newTask).catch(err => console.error("Error adding task:", err));
    
    return newId;
  };

  const addMessageToTask = (taskId: string, message: Message) => {
    if (!user) return;
    
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, messages: [...t.messages, message] } : t
      )
    );

    // Update Firestore
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      const taskRef = doc(db, "users", user.uid, "tasks", taskId);
      updateDoc(taskRef, {
        messages: [...task.messages, message]
      }).catch(err => console.error("Error adding message:", err));
    }
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    if (!user) return;
    
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status } : t))
    );

    // Update Firestore
    const taskRef = doc(db, "users", user.uid, "tasks", taskId);
    updateDoc(taskRef, { status }).catch(err => console.error("Error updating status:", err));
  };

  const updateTaskTitle = (taskId: string, title: string) => {
    if (!user) return;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title } : t))
    );

    // Update Firestore
    const taskRef = doc(db, "users", user.uid, "tasks", taskId);
    updateDoc(taskRef, { title }).catch(err => console.error("Error updating title:", err));
  };

  const deleteTask = (taskId: string) => {
    if (!user) return;

    // Optimistic update
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    // Delete from Firestore
    const taskRef = doc(db, "users", user.uid, "tasks", taskId);
    deleteDoc(taskRef).catch(err => console.error("Error deleting task:", err));
  };

  return {
    tasks,
    isLoaded,
    addTask,
    addMessageToTask,
    updateTaskStatus,
    updateTaskTitle,
    deleteTask,
  };
}
