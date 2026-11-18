import Link from "next/link";
import { setDisabled, setRole } from "@/app/actions/admin";
import { RowButton } from "@/components/forms";
import { CreateUserForm, ResetPassword } from "@/components/UserForms";
import { loadAccounts, signupOpen } from "@/lib/accounts";
import { requireAdmin } from "@/lib/dal";
import { KICKER } from "@/lib/ui";

export const metadata = { title: "Users" };

function day(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never";
}

export default async function UsersPage() {
  const me = await requireAdmin("/admin/users");
  const { users } = await loadAccounts();
  const sorted = [...users].sort((a, b) => a.role.localeCompare(b.role) || a.company.localeCompare(b.company));

  return (
    <>
      <section>
        <p className={`${KICKER} text-tape`}>Users</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Who gets in.</h1>
        <p className="mt-3 text-mute">
          Self sign-up is {signupOpen() ? "open: anyone can make a client account" : "closed"}. Set{" "}
          <code className="font-mono text-sm">LIFTPAGE_OPEN_SIGNUP</code> to change it.
        </p>
      </section>

      <section aria-labelledby="add" className="max-w-2xl">
        <h2 id="add" className="mb-4 text-2xl font-semibold">
          Add an account
        </h2>
        <CreateUserForm />
      </section>

      <section aria-labelledby="everyone">
        <h2 id="everyone" className="mb-4 text-2xl font-semibold">
          Everyone
        </h2>
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className={`${KICKER} text-mute`}>
              <tr className="border-b border-line text-left">
                <th className="px-3 py-2 font-normal">Account</th>
                <th className="px-3 py-2 font-normal">Role</th>
                <th className="px-3 py-2 font-normal">Joined</th>
                <th className="px-3 py-2 font-normal">Last sign-in</th>
                <th className="px-3 py-2 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((user) => {
                const self = user.id === me.id;
                return (
                  <tr key={user.id} className={`border-b border-line align-top last:border-0 ${user.disabled ? "text-mute" : ""}`}>
                    <td className="px-3 py-2">
                      {user.role === "client" ? (
                        <Link href={`/admin/customers/${user.id}`} className="text-tape underline underline-offset-4">
                          {user.company}
                        </Link>
                      ) : (
                        <span>{user.company}</span>
                      )}
                      <span className="block">{user.name}</span>
                      <span className="block font-mono text-xs text-mute">{user.email}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs uppercase">
                      {user.role}
                      {user.disabled ? <span className="block text-heat">off</span> : null}
                      {self ? <span className="block text-mute">you</span> : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-mute">{day(user.createdAt)}</td>
                    <td className="px-3 py-2 font-mono text-mute">{day(user.lastLoginAt)}</td>
                    <td className="px-3 py-2">
                      {self ? (
                        <Link href="/account" className="text-mute underline underline-offset-4">
                          Change your password
                        </Link>
                      ) : (
                        <div className="flex flex-wrap items-start gap-2">
                          <form action={setRole}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="role" value={user.role === "admin" ? "client" : "admin"} />
                            <RowButton>{user.role === "admin" ? "Make client" : "Make admin"}</RowButton>
                          </form>
                          <form action={setDisabled}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="disabled" value={user.disabled ? "false" : "true"} />
                            <RowButton tone={user.disabled ? "plain" : "heat"}>{user.disabled ? "Switch on" : "Switch off"}</RowButton>
                          </form>
                          <ResetPassword userId={user.id} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
