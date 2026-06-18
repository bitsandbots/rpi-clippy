import { useEffect, useState } from "react";
import { sproutApi } from "../sproutApi";

export const SettingsAbout: React.FC = () => {
  const [versions, setVersions] = useState<Record<string, string>>({});

  useEffect(() => {
    sproutApi.getVersions().then(setVersions);
  }, []);

  return (
    <div>
      <h1>About</h1>
      <fieldset>
        <legend>Version</legend>
        <p>
          Sprout <code>{versions.sprout || "Unknown"}</code> — Python{" "}
          <code>{versions.python || "Unknown"}</code>, Flask{" "}
          <code>{versions.flask || "Unknown"}</code>
        </p>
      </fieldset>
      <p>
        This app is a love letter and homage to the late, great Clippy, the
        assistant from Microsoft Office 1997. It is <i>not</i> affiliated,
        approved, or supported by Microsoft. Consider it software art. If you
        don't like it, consider it software satire.
      </p>
      <h3>Acknowledgments</h3>
      <p>
        Originally made by{" "}
        <a href="https://github.com/felixrieseberg" target="_blank">
          Felix Rieseberg
        </a>
        . Retro design by{" "}
        <a href="https://github.com/jdan" target="_blank">
          Jordan Scales
        </a>{" "}
        (98.css). Pi 5 / Ollama port by{" "}
        <a href="https://github.com/CoreConduit" target="_blank">
          CoreConduit
        </a>
        .
      </p>
      <p>
        The character was designed by illustrator{" "}
        <a href="https://www.kevanatteberry.com/" target="_blank">
          Kevan Atteberry
        </a>
        . Clippy and all visual assets related to Clippy are owned by Microsoft.
        This app is not affiliated with Microsoft.
      </p>
    </div>
  );
};
