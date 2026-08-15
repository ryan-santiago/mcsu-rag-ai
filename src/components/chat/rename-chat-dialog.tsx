"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { ChatSessionSummary } from "@/server/chat/types";

const renameFormSchema = z.object({
  title: z.string().trim().min(1, "Name is required").max(80, "That name is too long"),
});
type RenameFormValues = z.infer<typeof renameFormSchema>;

type RenameChatDialogProps = {
  target: ChatSessionSummary | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => void;
};

export function RenameChatDialog({ target, pending, onOpenChange, onSubmit }: RenameChatDialogProps) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {target ? (
          <RenameForm
            key={target.id}
            defaultTitle={target.title}
            pending={pending}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  defaultTitle,
  pending,
  onOpenChange,
  onSubmit,
}: {
  defaultTitle: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => void;
}) {
  const form = useForm<RenameFormValues>({
    resolver: zodResolver(renameFormSchema),
    defaultValues: { title: defaultTitle },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename chat</DialogTitle>
        <DialogDescription>Give this conversation a title you&apos;ll recognize later.</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => onSubmit(values.title.trim()))}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} autoFocus disabled={pending} placeholder="e.g. Leave policy questions" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
