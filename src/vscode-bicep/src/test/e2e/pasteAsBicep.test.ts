// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import vscode, { ConfigurationTarget, Selection, TextDocument } from "vscode";
import {
  executeCloseAllEditors,
  executeEditorPaste,
  executePasteAsBicepCommand,
} from "./commands";
import { getBicepConfiguration } from "../../language/getBicepConfiguration";
import { normalizeMultilineString } from "../utils/normalizeMultilineString";
import { SuppressedWarningsManager } from "../../commands/SuppressedWarningsManager";
import { bicepConfigurationKeys } from "../../language/constants";
import assert from "assert";
import { until } from "../utils/time";
import * as fse from "fs-extra";
import * as path from "path";

//import { getGlobalObjects } from "../../extension";

// const globalObjects = getGlobalObjects();
// globalObjects.__tests="tests";

// eslint-disable-next-line no-debugger
//debugger; //asdfg

const extensionLogPath = path.join(__dirname, "../../../bicep.log"); //asdfg visualizerLogPath?

describe("pasteAsBicep", (): void => {
  afterEach(async () => {
    await executeCloseAllEditors();
  });

  async function configureSettings(): Promise<void> {
    // Make sure Decompile on Paste is on
    await getBicepConfiguration().update(
      bicepConfigurationKeys.decompileOnPaste,
      true,
      ConfigurationTarget.Global
    );

    // Make sure decompile on paste warning is on
    await getBicepConfiguration().update(
      SuppressedWarningsManager.suppressedWarningsConfigurationKey,
      [],
      ConfigurationTarget.Global
    );
  }

  function getTextAndMarker(s: string): [text: string, markerOffset: number] {
    // eslint-disable-next-line no-debugger
    //debugger; //asdfg
    // let  asdfg2 = go;
    // let asdfg3 = asdfg2;
    // asdfg2 = asdfg3;

    const offset = s.indexOf("|");
    assert(offset >= 0, "Couldn't find marker in text");
    return [s.slice(0, offset) + s.slice(offset + 1), offset];
  }

  function setSelection(document: TextDocument, offsetStart: number): void {
    const start = document.positionAt(offsetStart);
    const activeTextEditor = vscode.window.activeTextEditor;
    assert(activeTextEditor, "No active text editor");
    activeTextEditor.selection = new Selection(start, start);
  }

  async function runTest(
    initialBicepWithMarker: string,
    jsonToPaste: string,
    expectedBicep: string,
    action: "command" | "copy/paste"
  ): Promise<void> {
    const initialLogContentsLength = fse
      .readFileSync(extensionLogPath)
      .toString().length;

    await configureSettings();

    const [initialBicep, offsetStart] = getTextAndMarker(
      initialBicepWithMarker
    );
    const textDocument = await vscode.workspace.openTextDocument({
      language: "bicep",
      content: initialBicep,
    });
    const editor = await vscode.window.showTextDocument(textDocument);

    setSelection(textDocument, offsetStart);

    await vscode.env.clipboard.writeText(jsonToPaste);

    // eslint-disable-next-line no-debugger
    //debugger; //asdfg

    //const completedPromise = PasteAsBicepCommand.createCompletionPromise();

    // eslint-disable-next-line no-debugger
    //debugger; //asdfg

    if (action === "copy/paste") {
      await executeEditorPaste();

      const expected = `PasteAsBicep (command): Result: "${jsonToPaste}"`;
      await waitForPasteAsBicep(expected);
    } else {
      await executePasteAsBicepCommand(editor.document.uri);

      const expected = `PasteAsBicep (copy/paste): Result: "${jsonToPaste}"`;
      await waitForPasteAsBicep(expected);
    }

    // eslint-disable-next-line no-debugger
    //debugger; //asdfg

    const buffer = textDocument.getText();

    expect(normalizeMultilineString(buffer)).toBe(
      normalizeMultilineString(expectedBicep)
    );

    function getRecentLogContents() {
      const logContents = fse
        .readFileSync(extensionLogPath)
        .toString()
        .substring(initialLogContentsLength);
      return logContents;
    }

    async function waitForPasteAsBicep(
      expectedSubstring: string
    ): Promise<void> {
      await until(() => isReady(), {
        interval: 100,
        timeoutMs: 4000,
      });
      if (!isReady()) {
        //asdfg () => `Current editor text:\n${textDocument.getText()}`
        throw new Error(
          `Expected paste as bicep command to complete. Expected following string in log: "${expectedSubstring}".\nRecent log contents: ${getRecentLogContents()}`
        );
      }

      function isReady(): boolean {
        const readyMessage = jsonToPaste;
        const logContents = getRecentLogContents();
        return logContents.indexOf(readyMessage) >= 0;
      }
    }
  }

  //////////////////////////////////////////////////

  //   it("should convert pasted list of resources", async () => {
  //     const jsonToPaste = `
  // {
  //   "type": "Microsoft.Storage/storageAccounts",
  //   "apiVersion": "2021-02-01",
  //   "name": "stg1",
  //   "location": "[parameters('location2')]",
  //   "kind": "StorageV2",
  //   "sku": {
  //     "name": "Premium_LRS"
  //   }
  // } /* no comma */{
  //   "name": "aksCluster1",
  //   "type": "Microsoft.ContainerService/managedClusters",
  //   "apiVersion": "2021-05-01",
  //   "location": "[resourceGroup().location]",
  //   "properties": {
  //     "kubernetesVersion": "1.15.7",
  //     "dnsPrefix": "dnsprefix",
  //     "agentPoolProfiles": [
  //       {
  //         "name": "agentpool",
  //         "count": 2,
  //         "vmSize": "Standard_A1",
  //         "osType": "Linux",
  //         "storageProfile": "ManagedDisks"
  //       }
  //     ],
  //     "linuxProfile": {
  //       "adminUsername": "adminUserName",
  //       "ssh": {
  //         "publicKeys": [
  //           {
  //             "keyData": "keyData"
  //           }
  //         ]
  //       }
  //     },
  //     "servicePrincipalProfile": {
  //       "clientId": "servicePrincipalAppId",
  //       "secret": "servicePrincipalAppPassword"
  //     }
  //   }
  // }
  // ,`;

  //     const expected = `resource stg1 'Microsoft.Storage/storageAccounts@2021-02-01' = {
  //   name: 'stg1'
  //   location: location2
  //   kind: 'StorageV2'
  //   sku: {
  //     name: 'Premium_LRS'
  //   }
  // }

  // resource aksCluster1 'Microsoft.ContainerService/managedClusters@2021-05-01' = {
  //   name: 'aksCluster1'
  //   location: resourceGroup().location
  //   properties: {
  //     kubernetesVersion: '1.15.7'
  //     dnsPrefix: 'dnsprefix'
  //     agentPoolProfiles: [
  //       {
  //         name: 'agentpool'
  //         count: 2
  //         vmSize: 'Standard_A1'
  //         osType: 'Linux'
  //         storageProfile: 'ManagedDisks'
  //       }
  //     ]
  //     linuxProfile: {
  //       adminUsername: 'adminUserName'
  //       ssh: {
  //         publicKeys: [
  //           {
  //             keyData: 'keyData'
  //           }
  //         ]
  //       }
  //     }
  //     servicePrincipalProfile: {
  //       clientId: 'servicePrincipalAppId'
  //       secret: 'servicePrincipalAppPassword'
  //     }
  //   }
  // }
  // // My bicep file
  // `;

  //     await runTest(`|// My bicep file\n`, jsonToPaste, expected);
  //   });

  //////////////////////////////////////////////////

  it("should decompile if copy/pasting outside string", async () => {
    const bicep = `var v = |`;
    const jsonToPaste = `"Mom says 'hi'"`;
    const expected = `var v = 'Mom says \\'hi\\''`;

    await runTest(bicep, jsonToPaste, expected, "copy/paste");
  });

  it("should not decompile if copy/pasting inside string", async () => {
    const bicep = `@description('|this is a description')
param s string`;
    const jsonToPaste = `"Mom says 'hi' "`;
    const expected = `@description('"Mom says 'hi' "this is a description')
param s string`;

    await runTest(bicep, jsonToPaste, expected, "copy/paste");
  });

  it("should not decompile if pasting inside multiline string", async () => {
    const bicep = `var v = '''
These are
|multiple
lines'''`;
    const jsonToPaste = `"really" `;
    const expected = `var v = '''
These are
"really" multiple
lines'''`;

    await runTest(bicep, jsonToPaste, expected, "copy/paste");
  });

  it("should decompile if executing menu even if inside string", async () => {
    const bicep = `@description('|this is a description')
param s string`;
    const jsonToPaste = `"Mom says 'hi' "`;
    const expected = `@description('"Mom says 'hi' "this is a description')
param s string`;

    await runTest(bicep, jsonToPaste, expected, "command");
  });

  //asdfg test: with range

  // asdfg test:
  /*
resource loadBalancerPublicIPAddress 'Microsoft.Network/publicIPAddresses@2020-11-01' = {
  name: 'loadBalancerName'
  location: '|location'
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'static'
  }
}


paste:
 {
      "type": "Microsoft.Resources/resourceGroups",
      "apiVersion": "2022-09-01",
      "name": "rg",
      "location": "[parameters('location')]"
    }
  
  */
});
