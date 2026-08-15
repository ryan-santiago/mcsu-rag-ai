"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounced } from "@/hooks/use-debounced";
import { can, type Principal } from "@/lib/rbac";
import { fetchAiSettings, fetchOllamaModels, saveChatSettings, saveEmbeddingSettings } from "@/server/ai-settings/actions";
import { aiSettingsQueryKey } from "@/server/ai-settings/query-key";
import type { AiSettingsView, SaveChatSettingsInput, SaveEmbeddingSettingsInput } from "@/server/ai-settings/types";

const embeddingFormSchema = z
  .object({
    provider: z.enum(["ollama", "api"]),
    ollamaBaseUrl: z.string().trim(),
    ollamaModel: z.string().trim(),
    apiProvider: z.literal("openai"),
    apiModel: z.string().trim(),
    apiKey: z.string().trim().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.provider === "ollama") {
      if (!/^https?:\/\/\S+$/.test(values.ollamaBaseUrl)) {
        ctx.addIssue({ code: "custom", path: ["ollamaBaseUrl"], message: "Enter a valid URL" });
      }
      if (!values.ollamaModel) {
        ctx.addIssue({ code: "custom", path: ["ollamaModel"], message: "Choose a model" });
      }
    } else if (!values.apiModel) {
      ctx.addIssue({ code: "custom", path: ["apiModel"], message: "Choose a model" });
    }
  });

type EmbeddingFormValues = z.infer<typeof embeddingFormSchema>;

const EMBEDDING_API_MODEL_OPTIONS = ["text-embedding-3-small", "text-embedding-3-large"];

const chatFormSchema = z
  .object({
    chatProvider: z.enum(["ollama", "api"]),
    ollamaChatModel: z.string().trim(),
    chatApiProvider: z.enum(["openai", "anthropic"]),
    chatApiModel: z.string().trim(),
    chatApiKey: z.string().trim().optional(),
    retrievalTopK: z.number().int().min(1).max(20),
    temperature: z.number().min(0).max(1),
    rateLimitPerMinute: z.number().int().min(1).max(120),
    outputModerationEnabled: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.chatProvider === "ollama" && !values.ollamaChatModel) {
      ctx.addIssue({ code: "custom", path: ["ollamaChatModel"], message: "Choose a model" });
    }
    if (values.chatProvider === "api" && !values.chatApiModel) {
      ctx.addIssue({ code: "custom", path: ["chatApiModel"], message: "Choose a model" });
    }
  });

type ChatFormValues = z.infer<typeof chatFormSchema>;

const CHAT_API_MODEL_OPTIONS: Record<"openai" | "anthropic", string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o"],
  anthropic: ["claude-haiku-4-5", "claude-sonnet-4-5"],
};

type AiSettingsViewProps = {
  actor: Principal;
};

export function AiSettingsView({ actor }: AiSettingsViewProps) {
  const { data, isPending } = useQuery({
    queryKey: aiSettingsQueryKey(),
    queryFn: () => fetchAiSettings(),
  });

  const canEdit = can(actor, "ai_settings:edit");

  if (isPending || !data) {
    return (
      <div className="space-y-6">
        {[0, 1].map((index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-72" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Remounts each form whenever the saved row actually changes, so defaultValues stay in sync without an effect.
  const key = data.updatedAt?.toISOString() ?? "unsaved";

  return (
    <div className="space-y-6">
      <EmbeddingSettingsForm key={`embedding-${key}`} settings={data} canEdit={canEdit} />
      <ChatSettingsForm key={`chat-${key}`} settings={data} canEdit={canEdit} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Embedding                                                                 */
/* -------------------------------------------------------------------------- */

function EmbeddingSettingsForm({ settings, canEdit }: { settings: AiSettingsView; canEdit: boolean }) {
  const queryClient = useQueryClient();

  const form = useForm<EmbeddingFormValues>({
    resolver: zodResolver(embeddingFormSchema),
    defaultValues: {
      provider: settings.provider,
      ollamaBaseUrl: settings.ollamaBaseUrl,
      ollamaModel: settings.ollamaModel,
      apiProvider: "openai",
      apiModel: settings.apiModel ?? EMBEDDING_API_MODEL_OPTIONS[0],
      apiKey: "",
    },
  });

  const provider = useWatch({ control: form.control, name: "provider" });
  const ollamaBaseUrl = useWatch({ control: form.control, name: "ollamaBaseUrl" });
  const ollamaModel = useWatch({ control: form.control, name: "ollamaModel" });
  const debouncedBaseUrl = useDebounced(ollamaBaseUrl, 500);

  const modelsQuery = useQuery({
    queryKey: ["ai-settings", "ollama-models", debouncedBaseUrl],
    queryFn: () => fetchOllamaModels(debouncedBaseUrl),
    enabled: provider === "ollama" && Boolean(debouncedBaseUrl),
  });

  const modelsResult = modelsQuery.data;
  const fetchedModels = modelsResult?.ok ? modelsResult.data : [];
  const modelsError = modelsResult && !modelsResult.ok ? modelsResult.error : null;
  // Always keep the currently-configured model selectable even if it didn't come back in the latest fetch.
  const modelOptions = Array.from(new Set([...(ollamaModel ? [ollamaModel] : []), ...fetchedModels]));

  const mutation = useMutation({
    mutationFn: (input: SaveEmbeddingSettingsInput) => saveEmbeddingSettings(input),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: aiSettingsQueryKey() });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  function onSubmit(values: EmbeddingFormValues) {
    const input: SaveEmbeddingSettingsInput =
      values.provider === "ollama"
        ? { provider: "ollama", ollamaBaseUrl: values.ollamaBaseUrl, ollamaModel: values.ollamaModel }
        : {
            provider: "api",
            apiProvider: "openai",
            apiModel: values.apiModel,
            apiKey: values.apiKey || undefined,
          };

    mutation.mutate(input);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Embedding provider</CardTitle>
            <CardDescription>
              Where document chunks get turned into vectors for search. Changing this doesn&apos;t re-embed
              documents already processed under the previous provider.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <Tabs value={field.value} onValueChange={(value) => field.onChange(value as "ollama" | "api")}>
                    <TabsList>
                      <TabsTrigger value="ollama" disabled={!canEdit}>
                        Local (Ollama)
                      </TabsTrigger>
                      <TabsTrigger value="api" disabled={!canEdit}>
                        API
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </FormItem>
              )}
            />

            {provider === "ollama" ? (
              <>
                <FormField
                  control={form.control}
                  name="ollamaBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ollama base URL</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!canEdit} placeholder="http://localhost:11434" />
                      </FormControl>
                      <FormDescription>
                        Where Ollama is running — shared with the chat model below (one Ollama host serves both).
                        Point this at a network-reachable host once this deploys somewhere that isn&apos;t this
                        machine.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ollamaModel"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Embedding model</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!canEdit || modelsQuery.isFetching}
                          onClick={() => void modelsQuery.refetch()}
                        >
                          <RotateCcw
                            className={modelsQuery.isFetching ? "size-3.5 animate-spin" : "size-3.5"}
                            aria-hidden
                          />
                          Refresh
                        </Button>
                      </div>
                      <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a model" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {modelOptions.length === 0 ? (
                            <div className="text-muted-foreground px-3 py-2 text-sm">No models found</div>
                          ) : (
                            modelOptions.map((model) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {modelsError ? (
                        <Alert variant="destructive">
                          <AlertDescription>{modelsError}</AlertDescription>
                        </Alert>
                      ) : (
                        <FormDescription>
                          Models installed on this Ollama host — nomic-embed-text is the recommended default.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="apiModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Embedding model</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a model" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EMBEDDING_API_MODEL_OPTIONS.map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>OpenAI is the only hosted embedding provider wired up today — Claude has no embeddings API.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API key</FormLabel>
                      <FormControl>
                        <PasswordInput
                          {...field}
                          disabled={!canEdit}
                          placeholder={
                            settings.apiKeyConfigured
                              ? "•••••••••••••••• (configured — leave blank to keep)"
                              : "sk-…"
                          }
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormDescription>
                        {settings.apiKeyConfigured
                          ? "A key is already saved and encrypted at rest. Leave this blank to keep it, or enter a new one to replace it."
                          : "Stored encrypted — never shown again once saved."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </CardContent>

          {canEdit ? (
            <CardFooter className="justify-end">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Save settings
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </form>
    </Form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chat & retrieval                                                          */
/* -------------------------------------------------------------------------- */

function ChatSettingsForm({ settings, canEdit }: { settings: AiSettingsView; canEdit: boolean }) {
  const queryClient = useQueryClient();

  const form = useForm<ChatFormValues>({
    resolver: zodResolver(chatFormSchema),
    defaultValues: {
      chatProvider: settings.chatProvider,
      ollamaChatModel: settings.ollamaChatModel,
      chatApiProvider: (settings.chatApiProvider as "openai" | "anthropic" | null) ?? "openai",
      chatApiModel: settings.chatApiModel ?? CHAT_API_MODEL_OPTIONS.openai[0],
      chatApiKey: "",
      retrievalTopK: settings.retrievalTopK,
      temperature: settings.temperature,
      rateLimitPerMinute: settings.rateLimitPerMinute,
      outputModerationEnabled: settings.outputModerationEnabled,
    },
  });

  const chatProvider = useWatch({ control: form.control, name: "chatProvider" });
  const chatApiProvider = useWatch({ control: form.control, name: "chatApiProvider" });
  const ollamaChatModel = useWatch({ control: form.control, name: "ollamaChatModel" });

  // The chat model picker reuses the embedding card's saved Ollama base URL — one Ollama host, no second field to edit.
  const modelsQuery = useQuery({
    queryKey: ["ai-settings", "ollama-models", settings.ollamaBaseUrl],
    queryFn: () => fetchOllamaModels(settings.ollamaBaseUrl),
    enabled: chatProvider === "ollama",
  });

  const modelsResult = modelsQuery.data;
  const fetchedModels = modelsResult?.ok ? modelsResult.data : [];
  const modelsError = modelsResult && !modelsResult.ok ? modelsResult.error : null;
  const modelOptions = Array.from(new Set([...(ollamaChatModel ? [ollamaChatModel] : []), ...fetchedModels]));

  const mutation = useMutation({
    mutationFn: (input: SaveChatSettingsInput) => saveChatSettings(input),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: aiSettingsQueryKey() });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  function onSubmit(values: ChatFormValues) {
    const input: SaveChatSettingsInput = {
      chatProvider: values.chatProvider,
      ollamaChatModel: values.ollamaChatModel,
      chatApiProvider: values.chatApiProvider,
      chatApiModel: values.chatApiModel,
      chatApiKey: values.chatApiKey || undefined,
      retrievalTopK: values.retrievalTopK,
      temperature: values.temperature,
      rateLimitPerMinute: values.rateLimitPerMinute,
      outputModerationEnabled: values.outputModerationEnabled,
    } as SaveChatSettingsInput;

    mutation.mutate(input);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Chat & retrieval</CardTitle>
            <CardDescription>
              Which model answers questions, how many document chunks it sees per question, and the guardrails
              around it.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <FormField
              control={form.control}
              name="chatProvider"
              render={({ field }) => (
                <FormItem>
                  <Tabs value={field.value} onValueChange={(value) => field.onChange(value as "ollama" | "api")}>
                    <TabsList>
                      <TabsTrigger value="ollama" disabled={!canEdit}>
                        Local (Ollama)
                      </TabsTrigger>
                      <TabsTrigger value="api" disabled={!canEdit}>
                        API
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </FormItem>
              )}
            />

            {chatProvider === "ollama" ? (
              <FormField
                control={form.control}
                name="ollamaChatModel"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Chat model</FormLabel>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!canEdit || modelsQuery.isFetching}
                        onClick={() => void modelsQuery.refetch()}
                      >
                        <RotateCcw
                          className={modelsQuery.isFetching ? "size-3.5 animate-spin" : "size-3.5"}
                          aria-hidden
                        />
                        Refresh
                      </Button>
                    </div>
                    <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {modelOptions.length === 0 ? (
                          <div className="text-muted-foreground px-3 py-2 text-sm">No models found</div>
                        ) : (
                          modelOptions.map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {modelsError ? (
                      <Alert variant="destructive">
                        <AlertDescription>{modelsError}</AlertDescription>
                      </Alert>
                    ) : (
                      <FormDescription>Models installed on the Ollama host set above.</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="chatApiProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API provider</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("chatApiModel", CHAT_API_MODEL_OPTIONS[value as "openai" | "anthropic"][0]);
                        }}
                        disabled={!canEdit}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="chatApiModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chat model</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a model" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CHAT_API_MODEL_OPTIONS[chatApiProvider].map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="chatApiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API key</FormLabel>
                      <FormControl>
                        <PasswordInput
                          {...field}
                          disabled={!canEdit}
                          placeholder={
                            settings.chatApiKeyConfigured
                              ? "•••••••••••••••• (configured — leave blank to keep)"
                              : "sk-…"
                          }
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormDescription>
                        {settings.chatApiKeyConfigured
                          ? "A key is already saved and encrypted at rest. Leave this blank to keep it, or enter a new one to replace it."
                          : "Stored encrypted — never shown again once saved."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <div className="grid gap-5 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="retrievalTopK"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retrieval top-K</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        disabled={!canEdit}
                        {...field}
                        onChange={(event) => field.onChange(event.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>Chunks retrieved per question.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperature</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.1}
                        disabled={!canEdit}
                        {...field}
                        onChange={(event) => field.onChange(event.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>Lower is more factual.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rateLimitPerMinute"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate limit</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        disabled={!canEdit}
                        {...field}
                        onChange={(event) => field.onChange(event.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>Messages / user / minute.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="outputModerationEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Output moderation</FormLabel>
                    <FormDescription>
                      Checks generated replies against a fixed blocklist before showing them.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>

          {canEdit ? (
            <CardFooter className="justify-end">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Save settings
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </form>
    </Form>
  );
}
