// 보고서 화면. src/reports/content.js의 블록 목록을 차례로 그린다.
function Table({ head, rows, num = [] }) {
  const cls = i => (num.includes(i) ? 'num' : undefined);
  return (
    <div className="r-table">
      <table>
        <thead><tr>{head.map((h, i) => <th key={i} className={cls(i)}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, y) => <tr key={y}>{r.map((c, i) => <td key={i} className={cls(i)}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Bars({ title, unit, items }) {
  const max = Math.max(...items.map(i => i[1]));
  return (
    <figure className="r-bars">
      <figcaption>{title}</figcaption>
      {items.map(([name, value], i) => (
        <div className="r-bar" key={name}>
          <span>{name}</span>
          <i><b className={i === 0 ? 'top' : undefined} style={{ width: `${(value / max) * 100}%` }} /></i>
          <strong>{value.toFixed(1)}{unit}</strong>
        </div>
      ))}
    </figure>
  );
}

// 긴 표·열 이름은 밑줄 뒤에서만 줄이 바뀌게 한다
const breakable = text => text.split('_').flatMap((part, i) => (i ? [<wbr key={i} />, '_' + part] : [part]));

function SchemaSide({ side, cls }) {
  return (
    <div className={`r-side ${cls}`}>
      <h3>{side.title}<span>{side.sub}</span></h3>
      <div className="r-groups">
        {side.groups.map(g => (
          <section key={g.label} className={g.added ? 'added' : undefined}>
            <h4>{g.label}</h4>
            <div className="r-tables">
              {g.tables.map(t => (
                <div key={t.name} className={'r-tb' + (t.changed ? ' changed' : '')}>
                  <div className="r-tn"><span>{breakable(t.name)}</span>{t.no && <em>{t.no}</em>}</div>
                  {t.cols.map(c => (Array.isArray(c)
                    ? <div key={c[0]} className="r-tc changed">{breakable(c[0])}</div>
                    : <div key={c} className="r-tc">{breakable(c)}</div>))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p>{side.note}</p>
    </div>
  );
}

// 표 구조의 전/후 비교. 빨간 테두리가 바뀌는 부분이고 번호가 좌우로 대응한다.
function Schema({ caption, before, after, changes }) {
  return (
    <figure className="r-schema">
      <figcaption>{caption} <b>빨간 테두리</b>가 바뀌는 부분이고, 번호는 좌우로 대응합니다.</figcaption>
      <div className="r-sides">
        <SchemaSide side={before} cls="before" />
        <SchemaSide side={after} cls="after" />
      </div>
      <ol>{changes.map(([no, text]) => <li key={no}><em>{no}</em>{text}</li>)}</ol>
    </figure>
  );
}

function Block({ b }) {
  if (b.h) return <h2>{b.h}</h2>;
  if (b.p) return <p>{b.p}</p>;
  if (b.note) return <p className="r-note">{b.note}</p>;
  if (b.list) return <ul>{b.list.map((t, i) => <li key={i}>{t}</li>)}</ul>;
  if (b.stats) {
    return (
      <div className="r-stats">
        {b.stats.map(s => <div key={s.l}><strong>{s.v}</strong><span>{s.l}</span><small>{s.s}</small></div>)}
      </div>
    );
  }
  if (b.table) return <Table {...b.table} />;
  if (b.schema) return <Schema {...b.schema} />;
  return <Bars {...b.bars} />;
}

export default function Report({ report }) {
  return (
    <main className="report">
      <article>
        <header>
          <h1>{report.title}</h1>
          <p>{report.lead}</p>
        </header>
        {report.blocks.map((b, i) => <Block key={i} b={b} />)}
        <footer>교육용 가상 데이터(400개사, 2024.11~2026.10)를 2026년 11월 15일 기준으로 분석한 결과입니다. 수치는 데이터 생성 가정을 반영합니다.</footer>
      </article>
    </main>
  );
}
