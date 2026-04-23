"use client";

// Lightweight toast state store, adapted from shadcn/ui's reference.
// Publishes a small Pub/Sub + a React hook so any component can call
// toast({...}) without prop-drilling.

import * as React from "react";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type Action =
  | { type: "ADD"; toast: ToasterToast }
  | { type: "UPDATE"; toast: Partial<ToasterToast> & { id: string } }
  | { type: "DISMISS"; id?: string }
  | { type: "REMOVE"; id?: string };

interface State { toasts: ToasterToast[] }

const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
function queueRemove(id: string) {
  if (timeouts.has(id)) return;
  timeouts.set(
    id,
    setTimeout(() => {
      timeouts.delete(id);
      dispatch({ type: "REMOVE", id });
    }, TOAST_REMOVE_DELAY),
  );
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD":
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case "UPDATE":
      return {
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      };
    case "DISMISS": {
      const ids = action.id
        ? [action.id]
        : state.toasts.map((t) => t.id);
      for (const id of ids) queueRemove(id);
      return {
        toasts: state.toasts.map((t) =>
          ids.includes(t.id) ? { ...t, open: false } : t,
        ),
      };
    }
    case "REMOVE":
      return {
        toasts: action.id
          ? state.toasts.filter((t) => t.id !== action.id)
          : [],
      };
  }
}

const listeners: Array<(s: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  for (const l of listeners) l(memoryState);
}

let idCounter = 0;
function uid() {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return idCounter.toString();
}

export type ToastInput = Omit<ToasterToast, "id"> & { id?: string };

export function toast(props: ToastInput) {
  const id = props.id ?? uid();
  const dismiss = () => dispatch({ type: "DISMISS", id });
  dispatch({
    type: "ADD",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => !open && dismiss(),
    },
  });
  return { id, dismiss, update: (next: Partial<ToasterToast>) => dispatch({ type: "UPDATE", toast: { ...next, id } }) };
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);
  return {
    toasts: state.toasts,
    toast,
    dismiss: (id?: string) => dispatch({ type: "DISMISS", id }),
  };
}
