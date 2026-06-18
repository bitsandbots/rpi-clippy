import { useEffect, useState } from "react";
import { sproutApi } from "../sproutApi";

export const SettingsAbout: React.FC = () => {
  const [versions, setVersions] = useState<Record<string, string>>({});

  useEffect(() => {
    sproutApi.getVersions().then(setVersions);
  }, []);

  return (
    <div>
      <h1>About Sprout</h1>
      <fieldset>
        <legend>Version</legend>
        <p>
          Sprout <code>{versions.sprout || "Unknown"}</code> — Python{" "}
          <code>{versions.python || "Unknown"}</code>, Flask{" "}
          <code>{versions.flask || "Unknown"}</code>
        </p>
      </fieldset>
      <p>
        Sprout is a local LLM chat assistant that runs on Raspberry Pi (and any
        Linux machine). It uses Ollama for inference — no cloud dependency, no
        data sent off-device.
      </p>
      <h3>Acknowledgments</h3>
      <p>
        Originally forked from{" "}
        <a href="https://github.com/felixrieseberg" target="_blank">
          Felix Rieseberg
        </a>
        {"'s"} rpi-clippy. Pi 5 / Ollama port and Sprout redesign by{" "}
        <a href="https://github.com/CoreConduit" target="_blank">
          CoreConduit
        </a>
        .
      </p>
    </div>
  );
};
