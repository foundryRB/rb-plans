import { Link } from "react-router-dom";
import { useVersionsPickerViewModel } from "../viewmodels/useVersionsPickerViewModel";

/** Versions · Picker (design.md): the version list, current marked;
 * selecting a version shows the decision-log rows between it and its
 * predecessor - the human diff (VER-004). Nothing here edits or
 * deletes a version.
 */
export function VersionsPicker() {
    const vm = useVersionsPickerViewModel();
    const current = vm.versions[vm.versions.length - 1]?.version;

    return (
        <section>
            <h1>Versions</h1>
            <Link className="btn" to={`/plans/${encodeURIComponent(vm.planId || "")}`}>
                Back to plan
            </Link>
            <table className="chrome-table" style={{ marginTop: "1rem" }}>
                <thead>
                    <tr>
                        <th>Version</th>
                        <th>Saved</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {vm.versions
                        .slice()
                        .reverse()
                        .map((v) => (
                            <tr key={v.version} className="row-link" onClick={() => vm.setSelected(v.version)}>
                                <td className="mono">
                                    {v.display || v.version} {v.version === current ? "(current)" : ""}
                                </td>
                                <td>{new Date(v.created_at).toLocaleString()}</td>
                                <td>
                                    <a className="btn" href={vm.exportUrl(v.version)} download onClick={(e) => e.stopPropagation()}>
                                        Download standalone
                                    </a>
                                </td>
                            </tr>
                        ))}
                </tbody>
            </table>

            {vm.selected !== null && (
                <div style={{ marginTop: "1.5rem" }}>
                    <h2>Decision log since the previous version</h2>
                    {vm.diff.length === 0 ? (
                        <p>No log rows between these versions.</p>
                    ) : (
                        <ul>
                            {vm.diff.map((row, i) => (
                                <li key={i}>
                                    <span className="mono">{row.date}</span> - {row.text} ({row.who})
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}
