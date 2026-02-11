import type { Backend, PBDeployment } from "../types";

import { UserCancelledError } from "../utils/errors";
import { isCancel, navigableSelect } from "./navigable";

export async function getPBDeploymentChoice(backend?: Backend, pbDeployment?: PBDeployment) {
  if (backend !== "pocketbase") {
    return "none";
  }

  if (pbDeployment !== undefined) return pbDeployment as PBDeployment;

  const options: Array<{ value: PBDeployment; label: string; hint: string }> = [
    {
      value: "self-hosted" as const,
      label: "Self-hosted",
      hint: "Download PocketBase binary for local development and VPS deployment",
    },
    {
      value: "pockethost" as const,
      label: "PocketHost",
      hint: "Managed cloud hosting with instant deployment and FTPS sync",
    },
    {
      value: "none" as const,
      label: "None",
      hint: "Manual setup - I'll configure PocketBase myself",
    },
  ];

  const response = await navigableSelect<PBDeployment>({
    message: "Select PocketBase deployment",
    options,
    initialValue: "self-hosted",
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return response;
}
