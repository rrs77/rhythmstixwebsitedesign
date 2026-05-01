import { useQuery } from "@tanstack/react-query";
import { readApiJson } from "@/lib/read-api-json";

export function useAdminMode() {
  return useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch("/api/auth/admin-check", { credentials: "include" });
      } catch {
        return false;
      }
      if (!res.ok) return false;
      try {
        const data = await readApiJson<{ authenticated: boolean }>(res);
        return data.authenticated;
      } catch {
        return false;
      }
    },
    staleTime: 60 * 1000,
  });
}
