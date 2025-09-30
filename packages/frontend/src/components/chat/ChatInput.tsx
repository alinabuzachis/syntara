export function ChatInput() {
  return (
    // 1. Main container: This is now the "glass pane".
    // It has the blur, the semi-transparent background, and padding.
    <div
      className="rounded-full glass p-1.5 justify-self-center min-w-128 max-w-full m-8"
      style={{
        boxShadow:
          "-2px -2px 4px var(--color-violet-800), 2px 2px 4px var(--color-sky-700), -2px 2px 4px var(--color-pink-800), 2px -2px 4px var(--color-pink-800)",
      }}
    >
      {/* 2. Gradient background: This element sits *behind* the glass pane.
          It's only visible through the padding of the parent above. */}
      {/* <div className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div> */}

      {/* 3. Input: This is now fully transparent to let the "glass" show through. */}
      <input
        className="p-1.5"
        placeholder="Type your message..."
        // className="w-full rounded-[10px] border-0 bg-transparent px-4 py-3 text-white placeholder-neutral-300 focus:outline-none"
      />
    </div>
  );
}
