// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { FC, useEffect, useState } from "react";
import { VSCodeButton, VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow, VSCodeProgressRing, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { createGetDeploymentScopeMessage, createPickParametersFileMessage, createReadyMessage, Message } from "../../messages";
import { vscode } from "../vscode";
import "./index.css";
import { RestError } from "@azure/core-rest-pipeline";
import { Deployment, DeploymentOperation, ErrorResponse, ResourceManagementClient } from "@azure/arm-resources";
import { AccessToken, TokenCredential } from "@azure/identity";
import { ParamData, ParamDefinition, TemplateMetadata } from "./models";
import { ParamInputBox } from "./ParamInputBox";
import { isFailed, isInProgress, parseParametersJson, parseTemplateJson } from "./utils";

function parseError(e: any): ErrorResponse {
  if (e instanceof RestError) {
    return e.details as ErrorResponse;
  }

  return {
    code: 'InternalError',
    message: `${e}`,
  };
}

function getDeploymentProperties(metadata: TemplateMetadata, paramValues: Record<string, ParamData>): Deployment {
  const parameters: any = {};
  for (let [key, { value }] of Object.entries(paramValues)) {
    parameters[key] = {
      value,
    }
  }

  return {
    properties: {
      mode: "Incremental",
      parameters,
      template: metadata.template,
    },
  }
}

function getArmClient(subscriptionId: string, accessToken: AccessToken) {
  const tokenProvider: TokenCredential = {
    getToken: async () => accessToken,
  };

  return new ResourceManagementClient(tokenProvider, subscriptionId);
}

function getPreformattedJson(input: any) {
  return (
    <pre>{JSON.stringify(input, null, 2)}</pre>
  )
}

interface DeployResult {
  succeeded: boolean,
  error?: ErrorResponse,
}

export const App : FC = () => {
  const [deploying, setDeploying] = useState(false);
  const [deploymentName, setDeploymentName] = useState('bicep-deploy');
  const [subscriptionId, setSubscriptionId] = useState<string>('');
  const [resourceGroup, setResourceGroup] = useState<string>('');
  const [accessToken, setAccessToken] = useState<AccessToken>();
  const [metadata, setMetadata] = useState<TemplateMetadata>();
  const [paramValues, setParamValues] = useState<Record<string, ParamData>>({});
  const [operations, setOperations] = useState<DeploymentOperation[]>();
  const [outputs, setOutputs] = useState<Record<string, any>>();
  const [result, setResult] = useState<DeployResult>();

  function setParamValue(key: string, data: ParamData) {
    const replaced = Object.assign({}, paramValues, {[key]: data});
    setParamValues(replaced);
  }

  const handleMessageEvent = (e: MessageEvent<Message>) => {
    const message = e.data;
    switch (message.kind) {
      case "DEPLOYMENT_DATA": {
        vscode.setState(message.documentPath);
        const metadata = parseTemplateJson(message.templateJson);
        setMetadata(metadata);
        return;
      }
      case "PARAMETERS_DATA": {
        const paramValues = parseParametersJson(message.parametersJson);
        setParamValues(paramValues);
        return;
      }
      case "NEW_DEPLOYMENT_SCOPE": {
        setSubscriptionId(message.subscriptionId);
        setResourceGroup(message.resourceGroup);
        setAccessToken(message.accessToken);
        return;
      }
    }
  };

  useEffect(() => {
    window.addEventListener("message", handleMessageEvent);
    vscode.postMessage(createReadyMessage());
    return () => window.removeEventListener("message", handleMessageEvent);
  }, []);

  function handleLoginClick() {
    vscode.postMessage(createGetDeploymentScopeMessage());
  }

  function handlePickParametersFileClick() {
    vscode.postMessage(createPickParametersFileMessage());
  }
  
  async function handleValidateClick() {
    if (!metadata || !accessToken) {
      return;
    }

    try {
      setDeploying(true);
      setOutputs(undefined);
      setResult(undefined);
      setOperations(undefined);
      const client = getArmClient(subscriptionId, accessToken);

      try {
        const response = await client.deployments.beginValidateAndWait(resourceGroup, deploymentName, getDeploymentProperties(metadata, paramValues));

        setResult({
          succeeded: !response.error,
          error: response.error,
        });
      } catch (e) {
        setResult({
          succeeded: false,
          error: parseError(e),
        });
        return;
      }
    }
    finally {
      setDeploying(false);
    }
  }

  async function handleDeployClick() {
    if (!metadata || !accessToken) {
      return;
    }

    try {
      setDeploying(true);
      setOutputs(undefined);
      setResult(undefined);
      setOperations(undefined);
      const client = getArmClient(subscriptionId, accessToken);

      const updateOperations = async () => {
        const operations = [];
        const result = client.deploymentOperations.list(resourceGroup, deploymentName);
        for await (const page of result.byPage()) {
          operations.push(...page);
        }
        setOperations(operations);
      }

      let poller;
      try {
        poller = await client.deployments.beginCreateOrUpdate(resourceGroup, deploymentName, getDeploymentProperties(metadata, paramValues));

        while (!poller.isDone()) {
          updateOperations();
          await new Promise(f => setTimeout(f, 5000));
          await poller.poll();
        }
      } catch (e) {
        setResult({
          succeeded: false,
          error: parseError(e),
        });
        return;
      } finally {
        updateOperations();
      }

      const finalResult = poller.getResult();
      setOutputs(finalResult?.properties?.outputs);
      setResult({
        succeeded: true,
      });
    } finally {
      setDeploying(false);
    }
  }

  function buildResultView() {
    if (!result) {
      return;
    }

    return (
      <>
        <h2>Result</h2>
        <p>{result.succeeded ? 'Succeeded' : 'Failed'}</p>
        {result.error ? getPreformattedJson(result.error) : null}
      </>
    )
  };

  function buildOutputView() {
    if (!outputs) {
      return;
    }

    return (
      <>
        <h2>Outputs</h2>
        <VSCodeDataGrid>
          <VSCodeDataGridRow rowType="header">
            <VSCodeDataGridCell gridColumn="1" cellType="columnheader">Name</VSCodeDataGridCell>
            <VSCodeDataGridCell gridColumn="2" cellType="columnheader">Value</VSCodeDataGridCell>
          </VSCodeDataGridRow>
          {Object.keys(outputs).map(name => (
            <VSCodeDataGridRow key={name}>
              <VSCodeDataGridCell gridColumn="1">{name}</VSCodeDataGridCell>
              <VSCodeDataGridCell gridColumn="2">{getPreformattedJson(outputs[name].value)}</VSCodeDataGridCell>
            </VSCodeDataGridRow>
          ))}
        </VSCodeDataGrid>
      </>
    );
  };

  function buildOperationsView() {
    if (!operations) {
      return;
    }

    const filteredOperations = operations
      .filter(x => x.properties?.provisioningOperation !== "EvaluateDeploymentOutput")

    if (filteredOperations.length == 0) {
      return null;
    }

    return (
      <>
        <h2>Operations</h2>
        <VSCodeDataGrid>
          <VSCodeDataGridRow rowType="header">
            <VSCodeDataGridCell gridColumn="1" cellType="columnheader">Resource Name</VSCodeDataGridCell>
            <VSCodeDataGridCell gridColumn="2" cellType="columnheader">Resource Type</VSCodeDataGridCell>
            <VSCodeDataGridCell gridColumn="3" cellType="columnheader">Operation</VSCodeDataGridCell>
            <VSCodeDataGridCell gridColumn="4" cellType="columnheader">State</VSCodeDataGridCell>
            <VSCodeDataGridCell gridColumn="5" cellType="columnheader">Status</VSCodeDataGridCell>
          </VSCodeDataGridRow>
          {filteredOperations.map(operation => (
            <VSCodeDataGridRow key={operation.id} style={isFailed(operation) ? {background: "rgba(255, 72, 45, 0.3)"} : {}}>
              <VSCodeDataGridCell gridColumn="1">{operation.properties?.targetResource?.resourceName}</VSCodeDataGridCell>
              <VSCodeDataGridCell gridColumn="2">{operation.properties?.targetResource?.resourceType}</VSCodeDataGridCell>
              <VSCodeDataGridCell gridColumn="3">{operation.properties?.provisioningOperation}</VSCodeDataGridCell>
              <VSCodeDataGridCell gridColumn="4">
                {isInProgress(operation) ? <VSCodeProgressRing/> : operation.properties?.provisioningState}
              </VSCodeDataGridCell>
              <VSCodeDataGridCell gridColumn="5">{getPreformattedJson(operation.properties?.statusMessage)}</VSCodeDataGridCell>
            </VSCodeDataGridRow>
          ))}
        </VSCodeDataGrid>
      </>
    );
  };

  function getParamData(definition: ParamDefinition): ParamData {
    return paramValues[definition.name] ?? {
      value: definition.defaultValue ?? '',
      useDefault: definition.defaultValue !== undefined,
    };
  }

  function buildParamsView() {
    if (!metadata) {
      return;
    }

    const { parameters } = metadata;

    return parameters.map(definition => (
      <ParamInputBox
        key={definition.name}
        definition={definition}
        data={getParamData(definition)}
        disabled={deploying}
        onChangeData={data => setParamValue(definition.name, data)}
      />
    ));
  }

  return (
    <main id="webview-body">
      <section className="form-section">
        <h2>Deployment Properties</h2>
        <div className="controls">
          <VSCodeButton onClick={handleLoginClick} appearance={accessToken ? "secondary" : "primary"}>Login</VSCodeButton>
          <VSCodeButton onClick={handlePickParametersFileClick} appearance="secondary">Pick Parameters File</VSCodeButton>
        </div>
        <VSCodeTextField value={subscriptionId} onInput={e => setSubscriptionId((e.target as any).value)} disabled={true}>
          Subscription Id
        </VSCodeTextField>
        <VSCodeTextField value={resourceGroup} onInput={e => setResourceGroup((e.target as any).value)} disabled={true}>
          Resource Group
        </VSCodeTextField>
        <VSCodeTextField value={deploymentName} onInput={e => setDeploymentName((e.target as any).value)} disabled={deploying}>
          Deployment Name
        </VSCodeTextField>

        {buildParamsView()}

        <div className="controls">
          <VSCodeButton onClick={handleDeployClick} disabled={!metadata || !accessToken || deploying}>Deploy</VSCodeButton>
          <VSCodeButton onClick={handleValidateClick} disabled={!metadata || !accessToken || deploying}>Validate</VSCodeButton>
        </div>
      </section>

      <section className="form-section">
        {deploying ? <VSCodeProgressRing/> : null}
        {buildResultView()}
        {buildOperationsView()}
        {buildOutputView()}
      </section>
    </main>
  );
};