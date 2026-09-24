import { enqueueGenJob } from "./db/promptsRepo.js";
try {
  const job = enqueueGenJob({
    userId: null,
    mode: "text",
    model: "gpt-image-2",
    size: "1024x1024",
    quality: "medium",
    prompt: "probe",
    negativePrompt: "",
    referenceImageUrl: null,
    editStrength: null,
    maxAttempts: 1,
    publishToPrompts: false,
    initialStatus: "queued",
    sourceChannel: "",
    providerName: "",
    isHeartbeat: false,
    heartbeatRunId: "",
    heartbeatKind: "",
    heartbeatCategory: "",
    preferredChannel: "",
    priority: 0,
  });
  console.log("OK", job?.id, job?.status);
} catch (e) {
  console.error("ERR", e?.code || "", e?.message || e);
  console.error(e?.stack || "");
}
