import { toast } from "sonner";

type ToastType = "success" | "error" | "warning" | "info";

const DURATION: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

export function showToast(type: ToastType, message: string) {
  const duration = DURATION[type];

  switch (type) {
    case "success":
      toast.success(message, { duration, position: "bottom-right" });
      break;
    case "error":
      toast.error(message, { duration, position: "bottom-right" });
      break;
    case "warning":
      toast.warning(message, { duration, position: "bottom-right" });
      break;
    case "info":
      toast.info(message, { duration, position: "bottom-right" });
      break;
  }
}
