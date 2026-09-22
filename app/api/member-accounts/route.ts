import { checkMutation, failure, jsonBody, reply } from "@/lib/server-store";
import { createAccount, listAccounts, requireAccountOwner, updateAccount } from "@/lib/member-auth";
export async function GET(request: Request) {
  try { await requireAccountOwner(request); return reply({ accounts: await listAccounts() }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { checkMutation(request); await requireAccountOwner(request); await createAccount(await jsonBody(request)); return reply({ accounts: await listAccounts() }, 201); } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try { checkMutation(request); await requireAccountOwner(request); await updateAccount(await jsonBody(request)); return reply({ accounts: await listAccounts() }); } catch (error) { return failure(error); }
}
