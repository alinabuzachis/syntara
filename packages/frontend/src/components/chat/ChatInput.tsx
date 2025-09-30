export function ChatInput() {
  return (
    <div
      className="rounded-full glass p-1.5 justify-self-center min-w-128 max-w-128 self-center mt-4"
      style={{
        boxShadow:
          "-2px -2px 4px var(--color-violet-800), 2px 2px 4px var(--color-sky-700), -2px 2px 4px var(--color-pink-800), 2px -2px 4px var(--color-pink-800)",
      }}
    >
      <input
        className="p-1.5 px-3 w-full rounded-2xl"
        placeholder="Type your message..."
      />
    </div>
  );
}
