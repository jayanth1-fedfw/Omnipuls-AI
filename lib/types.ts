export type Priority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "active" | "complete";
export type AlertTone = "focused" | "creative" | "urgent" | "kind";

export type Task = {
  id: string;
  customerName: string;
  workGoal: string;
  sourceMemory: string;
  deadline: string;
  dailyTime: string;
  priority: Priority;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type Memory = {
  id: string;
  text: string;
  createdAt: string;
};

export type ManualAlert = {
  id: string;
  message: string;
  alertAt: string;
  fired: boolean;
  createdAt: string;
};

export type OmnipulsState = {
  tasks: Task[];
  memories: Memory[];
  manualAlerts: ManualAlert[];
};

export type TaskInput = {
  customerName: string;
  workGoal: string;
  sourceMemory: string;
  deadline: string;
  dailyTime: string;
  priority: Priority;
  status: TaskStatus;
};

export type ManualAlertInput = {
  message: string;
  alertAt: string;
};

export type CopilotSuggestion = {
  reply: string;
  memory?: string;
  task?: TaskInput;
  manualAlert?: ManualAlertInput;
};

export type AssistantMode = "general" | "deep_learning" | "workflow" | "research";

export type AssistantRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: AssistantMode;
  createdAt: string;
};

export type AssistantResponse = {
  reply: string;
  mode: AssistantMode;
  memory?: string;
  task?: TaskInput;
  manualAlert?: ManualAlertInput;
  vaultEntry?: {
    title: string;
    note: string;
    tags: string[];
  };
};
