import { parseEffectMarkup } from '../lib/effectMarkup';

export function RelicEffect({ text }: { text: string }) {
  const blocks = parseEffectMarkup(text);
  return (
    <div className="relic-effect">
      {blocks.map((block, i) => {
        if (block.kind === 'p') {
          return (
            <p key={i} className="relic-effect-p">
              {block.text}
            </p>
          );
        }
        return (
          <ul key={i} className="relic-effect-list">
            {block.items.map((item, j) => (
              <li key={j}>
                <span>{item.text}</span>
                {item.children && item.children.length > 0 && (
                  <ul className="relic-effect-sublist">
                    {item.children.map((child, k) => (
                      <li key={k}>{child.text}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
