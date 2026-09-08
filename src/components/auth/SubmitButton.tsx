import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  icon: ReactNode;
  children: ReactNode;
}

// This form posts to a plain URL (a real browser navigation, not a React 19
// form action), so there's no React-managed pending state to show a spinner
// for — `useFormStatus()` requires a function `action` and crashed under
// SSR here since none is provided.
export function SubmitButton({ icon, children }: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      className="w-full rounded-lg bg-[oklch(0.5485_0.1061_160.41)] px-4 py-2 font-medium text-white transition-colors hover:bg-[oklch(0.6085_0.1061_160.41)]"
    >
      <span className="flex items-center gap-2">
        {icon}
        {children}
      </span>
    </Button>
  );
}
