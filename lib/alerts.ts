import type { AlertTone, Memory, Task } from "@/lib/types";

export function createAlertMessage(task: Task, memories: Memory[], tone: AlertTone) {
  const memoryHint = task.sourceMemory || memories[0]?.text || "No previous customer context yet";
  const daysLeft = daysUntil(task.deadline);
  const pressure =
    daysLeft <= 1 ? "Final stretch" : daysLeft <= 3 ? "Deadline is closing in" : "Steady progress window";

  const messages: Record<AlertTone, string> = {
    focused: `${pressure}. Follow up with ${task.customerName} about "${task.workGoal}" using this context: ${memoryHint}.`,
    creative: `${pressure}. Spark ${task.customerName}'s next move with a crisp reminder for "${task.workGoal}" inspired by: ${memoryHint}.`,
    urgent: `${pressure}. Push ${task.customerName} now so "${task.workGoal}" does not slip. Context: ${memoryHint}.`,
    kind: `${pressure}. Send ${task.customerName} a helpful nudge for "${task.workGoal}" and make the next step feel easy. Context: ${memoryHint}.`
  };

  return messages[tone];
}

export function remainingText(value: string) {
  const deadline = new Date(value);
  const diff = deadline.getTime() - Date.now();

  if (diff <= 0) {
    return "Deadline reached";
  }

  const hours = Math.ceil(diff / 36e5);
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;

  if (days > 0) {
    return `${days}d ${restHours}h left`;
  }

  return `${hours}h left`;
}

export function daysUntil(value: string) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 864e5);
}
