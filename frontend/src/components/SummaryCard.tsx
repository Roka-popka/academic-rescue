interface Props {
  title: string;
  value: number;
  description: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
}

export default function SummaryCard({ title, value, description, tone }: Props) {
  return (
    <article className={`summary-card ${tone}`}>
      <div className="summary-label"><h2>{title}</h2><span className="summary-dot" aria-hidden="true" /></div>
      <strong className="summary-value">{value}</strong>
      <p>{description}</p>
    </article>
  );
}
