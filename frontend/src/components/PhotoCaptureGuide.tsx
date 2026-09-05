// Owner-facing photo capture guide (documents/3d-model-enhancement.md §4) —
// input quality is the #1 driver of 3D model realism, so this sits right
// at the upload step rather than buried in docs. Icon+text do/don't rows
// stand in for example photos — no real dish photography exists to embed.
const DOS = [
  { icon: '💡', text: 'Bright, even, diffuse lighting — no harsh shadows or glare' },
  { icon: '🧼', text: 'Plain, uncluttered background' },
  { icon: '🔍', text: 'High resolution, with the dish filling the frame' },
  { icon: '🔄', text: 'Multiple angles — front, side, top, back (up to 5 photos)' },
];

const DONTS = [
  { icon: '✨', text: 'Glossy reflections or glare — they confuse 3D reconstruction' },
  { icon: '🌑', text: 'Dim or single-direction harsh lighting' },
  { icon: '🗂️', text: 'A busy, cluttered background' },
];

export function PhotoCaptureGuide() {
  return (
    <details className="photo-guide">
      <summary>📸 Tips for great photos (better photos = better 3D models)</summary>
      <div className="photo-guide-columns">
        <div>
          <h4>Do</h4>
          <ul className="photo-guide-list">
            {DOS.map((item) => (
              <li key={item.text}>
                <span aria-hidden="true">{item.icon}</span> {item.text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Avoid</h4>
          <ul className="photo-guide-list">
            {DONTS.map((item) => (
              <li key={item.text}>
                <span aria-hidden="true">{item.icon}</span> {item.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
