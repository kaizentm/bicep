// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Bicep.Core.Emit;
using Bicep.LanguageServer.CompilationManager;
using MediatR;
using Microsoft.Extensions.Logging;
using OmniSharp.Extensions.JsonRpc;
using OmniSharp.Extensions.LanguageServer.Protocol.Models;

namespace Bicep.LanguageServer.Handlers
{
    [Method("bicep/getDeploymentData", Direction.ClientToServer)]
    public record GetDeploymentDataRequest(TextDocumentIdentifier TextDocument)
        : ITextDocumentIdentifierParams, IRequest<GetDeploymentDataResponse?>;

    public record GetDeploymentDataResponse(string TemplateJson);

    public class GetDeploymentDataHandler : IJsonRpcRequestHandler<GetDeploymentDataRequest, GetDeploymentDataResponse?>
    {
        private readonly ILogger<BicepDocumentSymbolHandler> logger;
        private readonly ICompilationManager compilationManager;

        public GetDeploymentDataHandler(ILogger<BicepDocumentSymbolHandler> logger, ICompilationManager compilationManager)
        {
            this.logger = logger;
            this.compilationManager = compilationManager;
        }

        public async Task<GetDeploymentDataResponse?> Handle(GetDeploymentDataRequest request, CancellationToken cancellationToken)
        {
            await Task.Yield();

            if (this.compilationManager.GetCompilation(request.TextDocument.Uri) is not {} context)
            {
                return null;
            }

            var semanticModel = context.Compilation.GetEntrypointSemanticModel();

            using var templateStringWriter = new StringWriter();
            var result = new TemplateEmitter(semanticModel).Emit(templateStringWriter);
            if (result.Status == EmitStatus.Failed)
            {
                return null;
            }

            return new(templateStringWriter.ToString());
        }
    }
}
