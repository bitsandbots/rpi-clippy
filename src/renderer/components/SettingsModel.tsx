import { Column, TableView } from "./TableView";
import { Progress } from "./Progress";
import React, { useState } from "react";
import { useSharedState } from "../contexts/SharedStateContext";
import { clippyApi } from "../clippyApi";
import { downloadModelByTag } from "../api";
import { prettyDownloadSpeed } from "../helpers/convert-download-speed";
import { ManagedModel } from "../../models";
import { isModelDownloading } from "../../helpers/model-helpers";

export const SettingsModel: React.FC = () => {
  const { models, settings } = useSharedState();
  const catalog = models?.catalog ?? {};
  const orphans = models?.orphans ?? [];
  const catalogKeys = Object.keys(catalog);

  const [selectedSection, setSelectedSection] = useState<"catalog" | "orphans">(
    "catalog",
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [pullTag, setPullTag] = useState("");
  const [isPulling, setIsPulling] = useState(false);

  const columns: Array<Column> = [
    { key: "default", header: "Loaded", width: 50 },
    { key: "name", header: "Name" },
    {
      key: "size",
      header: "Size",
      render: (row) => `${row.size.toLocaleString()} MB`,
    },
    { key: "company", header: "Company" },
    { key: "downloaded", header: "Downloaded" },
  ];

  const catalogData = catalogKeys.map((key) => {
    const model = catalog[key];
    return {
      default: model?.name === settings.selectedModel ? "ｘ" : "",
      name: model?.name,
      company: model?.company ?? "",
      size: model?.size ?? 0,
      downloaded: model?.downloaded ? "Yes" : "No",
    };
  });

  const orphanData = orphans.map((m) => ({
    default: m.name === settings.selectedModel ? "ｘ" : "",
    name: m.name,
    company: "-",
    size: m.size ?? 0,
    downloaded: m.downloaded ? "Yes" : "No",
  }));

  const selectedModel: ManagedModel | null =
    selectedSection === "catalog" && catalogKeys.length > 0
      ? (catalog[catalogKeys[selectedIndex]] ?? null)
      : selectedSection === "orphans" && orphans.length > 0
        ? (orphans[selectedIndex] ?? null)
        : null;

  const isDownloading = isModelDownloading(selectedModel);
  const isDefaultModel = selectedModel?.name === settings.selectedModel;

  const handleCatalogSelect = (index: number) => {
    setSelectedSection("catalog");
    setSelectedIndex(index);
  };

  const handleOrphanSelect = (index: number) => {
    setSelectedSection("orphans");
    setSelectedIndex(index);
  };

  const handlePull = async () => {
    const tag = pullTag.trim();
    if (!tag) return;
    setIsPulling(true);
    try {
      await downloadModelByTag(tag);
    } finally {
      setIsPulling(false);
      setPullTag("");
    }
  };

  const handleQuickSelect = (tag: string) => {
    setPullTag(tag);
  };

  const handleDeleteOrRemove = async () => {
    if (!selectedModel) return;
    if (selectedModel.imported) {
      await clippyApi.removeModelByName(selectedModel.name);
    } else {
      await clippyApi.deleteModelByName(selectedModel.name);
    }
  };

  const handleMakeDefault = async () => {
    if (selectedModel) {
      await clippyApi.setState("settings.selectedModel", selectedModel.name);
    }
  };

  const quickTags = catalogKeys
    .map((k) => catalog[k]?.ollamaTag)
    .filter(Boolean) as string[];

  return (
    <div>
      <p>
        Select the model you want to use for your chat. The larger the model,
        the more powerful the chat, but the slower it will be - and the more
        memory it will use. Clippy uses models in the GGUF format.{" "}
        <a
          href="https://github.com/felixrieseberg/clippy?tab=readme-ov-file#downloading-more-models"
          target="_blank"
        >
          More information.
        </a>
      </p>

      <fieldset>
        <legend>Suggested Models</legend>
        {catalogData.length > 0 ? (
          <TableView
            columns={columns}
            data={catalogData}
            onRowSelect={handleCatalogSelect}
            initialSelectedIndex={
              selectedSection === "catalog" ? selectedIndex : 0
            }
          />
        ) : (
          <p style={{ color: "#888" }}>No suggested models available.</p>
        )}
      </fieldset>

      {orphanData.length > 0 && (
        <fieldset>
          <legend>Other Models (from Ollama)</legend>
          <TableView
            columns={columns}
            data={orphanData}
            onRowSelect={handleOrphanSelect}
            initialSelectedIndex={
              selectedSection === "orphans" ? selectedIndex : 0
            }
          />
        </fieldset>
      )}

      {selectedModel && (
        <div
          className="model-details sunken-panel"
          style={{ marginTop: "20px", padding: "15px" }}
        >
          <strong>{selectedModel.name}</strong>

          {selectedModel.actualTag && (
            <div style={{ marginTop: "4px" }}>
              <code style={{ color: "#555" }}>{selectedModel.actualTag}</code>
            </div>
          )}

          <div style={{ marginTop: "15px", display: "flex", gap: "10px" }}>
            {!selectedModel.downloaded ? (
              <button
                disabled={isDownloading}
                onClick={() => {
                  if (selectedModel.actualTag) {
                    setPullTag(selectedModel.actualTag);
                  }
                }}
              >
                Download Model
              </button>
            ) : (
              <>
                <button
                  disabled={isDownloading || isDefaultModel}
                  onClick={handleMakeDefault}
                >
                  {isDefaultModel
                    ? "Clippy uses this model"
                    : "Make Clippy use this model"}
                </button>
                <button onClick={handleDeleteOrRemove}>
                  {selectedModel?.imported ? "Remove" : "Delete"} Model
                </button>
              </>
            )}
          </div>
          <SettingsModelDownload model={selectedModel} />
        </div>
      )}

      <fieldset style={{ marginTop: "15px" }}>
        <legend>Pull New Model</legend>
        <div className="field-row">
          <label style={{ width: 50 }}>Tag:</label>
          <input
            type="text"
            value={pullTag}
            onChange={(e) => setPullTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePull()}
            placeholder="e.g. llama3.2:1b"
            style={{ flex: 1, marginRight: "6px" }}
          />
          <button onClick={handlePull} disabled={isPulling || !pullTag.trim()}>
            {isPulling ? "Pulling..." : "Pull"}
          </button>
        </div>
        {quickTags.length > 0 && (
          <div
            style={{
              marginTop: "6px",
              display: "flex",
              gap: "4px",
              flexWrap: "wrap",
            }}
          >
            {quickTags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleQuickSelect(tag)}
                style={{ fontSize: "0.85em", padding: "2px 6px" }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
};

const SettingsModelDownload: React.FC<{
  model?: ManagedModel;
}> = ({ model }) => {
  if (!model || !isModelDownloading(model)) {
    return null;
  }

  const downloadSpeed = prettyDownloadSpeed(
    model?.downloadState?.currentBytesPerSecond || 0,
  );

  return (
    <div style={{ marginTop: "15px" }}>
      <p>
        Downloading {model.name}... ({downloadSpeed}/s)
      </p>
      <Progress progress={model.downloadState?.percentComplete || 0} />
    </div>
  );
};
