"use client"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function NewAthletePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)

    await fetch("/api/athletes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        email: form.get("email"),
        gradYear: form.get("gradYear") ? Number(form.get("gradYear")) : null,
      }),
    })

    router.push("/athletes")
    router.refresh()
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-medium mb-6">Add athlete</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">First name</label>
            <input name="firstName" required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Last name</label>
            <input name="lastName" required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Email</label>
          <input name="email" type="email" required className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Grad year</label>
          <input name="gradYear" type="number" placeholder="2026" className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add athlete"}
        </button>
      </form>
    </main>
  )
}