"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { RenameChatDialog } from "@/components/chat/rename-chat-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { deleteChatSession, fetchChatSessions, renameChatSession } from "@/server/chat/actions";
import { chatSessionsQueryKey } from "@/server/chat/query-key";
import type { ChatSessionSummary } from "@/server/chat/types";

type RecentChatsNavProps = {
  canEdit: boolean;
  canDelete: boolean;
  onNavigate?: () => void;
};

/**
 * The dynamic half of the Chat nav group — "New Chat" is a static link
 * declared in `lib/navigation.ts`; the history list below it is per-user data,
 * fetched here instead. Rendered by `SidebarNav` for the group marked
 * `dynamic: "chat-history"`.
 */
export function RecentChatsNav({ canEdit, canDelete, onNavigate }: RecentChatsNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery<ChatSessionSummary[]>({
    queryKey: chatSessionsQueryKey(),
    queryFn: fetchChatSessions,
  });

  const [renaming, setRenaming] = React.useState<ChatSessionSummary | null>(null);
  const [deleting, setDeleting] = React.useState<ChatSessionSummary | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: chatSessionsQueryKey() });
        if (deleting && pathname === `/chat/${deleting.id}`) router.push("/chat");
        setRenaming(null);
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const sessions = data ?? [];

  return (
    <div className="space-y-1">
      <h3 className="text-muted-foreground/70 px-3 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-[0.1em] uppercase">
        Recent Chats
      </h3>

      {isPending ? (
        <div className="space-y-1.5 px-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full rounded-md" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-muted-foreground px-3 py-1 text-xs text-pretty">No chats yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {sessions.map((session) => {
            const active = pathname === `/chat/${session.id}`;
            return (
              <li key={session.id} className="group/row relative">
                <Link
                  href={`/chat/${session.id}`}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md py-1.5 pr-8 pl-3 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "bg-primary absolute inset-y-1.5 left-0 w-[3px] rounded-full transition-opacity",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <MessageSquare className="size-3.5 shrink-0 opacity-70" aria-hidden />
                  <span className="truncate">{session.title}</span>
                </Link>

                {canEdit || canDelete ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={mutation.isPending}
                        aria-label={`Actions for ${session.title}`}
                        className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal className="size-3.5" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit ? (
                        <DropdownMenuItem onSelect={() => setRenaming(session)}>
                          <Pencil className="size-4" aria-hidden />
                          Rename
                        </DropdownMenuItem>
                      ) : null}
                      {canDelete ? (
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(session)}>
                          <Trash2 className="size-4" aria-hidden />
                          Delete
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <RenameChatDialog
        target={renaming}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSubmit={(title) => renaming && mutation.mutate(() => renameChatSession({ id: renaming.id, title }))}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{deleting.title}</span> and its messages will be
                  permanently removed. This can&apos;t be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleting) return;
                mutation.mutate(() => deleteChatSession({ id: deleting.id }));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
