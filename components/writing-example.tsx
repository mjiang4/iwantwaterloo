export function WritingExample({ reply = false }: { reply?: boolean }) {
  return (
    <details className="writing-example">
      <summary>Need an example?</summary>
      <p>
        {reply
          ? '“Covered seating would help in the rain—could we try it near the library?”'
          : '“A covered seating area near the library so we can meet outside when it rains.”'}
      </p>
    </details>
  );
}
