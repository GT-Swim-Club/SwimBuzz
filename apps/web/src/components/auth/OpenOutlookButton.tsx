import Image from "next/image"

const OUTLOOK_WEB_URL = "https://outlook.office.com/mail/"

/** Shortcut to GT's Outlook inbox from the OTP code step. */
export default function OpenOutlookButton() {
  return (
    <a
      href={OUTLOOK_WEB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-5 py-3 text-[15px] font-medium text-foreground shadow-sm transition-colors hover:bg-fill-secondary"
    >
      <Image
        src="/outlook-icon.png"
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 shrink-0"
      />
      Open Outlook
    </a>
  )
}
