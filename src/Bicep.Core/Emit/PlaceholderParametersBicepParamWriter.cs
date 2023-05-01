// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using Bicep.Core.Diagnostics;
using Bicep.Core.Parsing;
using Bicep.Core.PrettyPrint;
using Bicep.Core.PrettyPrint.Options;
using Bicep.Core.Semantics;
using Bicep.Core.Syntax;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Bicep.Core.Emit
{
    public class PlaceholderParametersBicepParamWriter
    {
        public PlaceholderParametersBicepParamWriter(SemanticModel semanticModel, string includeParams)
        {
            this.Context = new EmitterContext(semanticModel);
            this.IncludeParams = includeParams;
        }

        private EmitterContext Context { get; }

        private string IncludeParams { get; }

        public void Write(TextWriter writer, string existingContent)
        {
            var bicepFileName = Path.GetFileName(this.Context.SemanticModel.SourceFile.FileUri.LocalPath);

            var allParameterDeclarations = this.Context.SemanticModel.Root.ParameterDeclarations;

            var filteredParameterDeclarations = this.IncludeParams == "all" ? allParameterDeclarations.Select(e => e.DeclaringParameter) : allParameterDeclarations.Where(e => e.DeclaringParameter.Modifier is not ParameterDefaultValueSyntax).Select(e => e.DeclaringParameter);

            var result = filteredParameterDeclarations
                            .OfType<ParameterDeclarationSyntax>()
                            .Select(e => new ParameterAssignmentSyntax(e.Keyword, e.Name, SyntaxFactory.AssignmentToken, this.GetValueForParameter(e)))
                            .SelectMany(e => new List<SyntaxBase>() { e, SyntaxFactory.NewlineToken });

            var processedSyntaxList = new List<SyntaxBase>()
            {
                new UsingDeclarationSyntax(SyntaxFactory.CreateToken(TokenType.Identifier, "using"), SyntaxFactory.CreateStringLiteral($"./{bicepFileName}")),
                SyntaxFactory.NewlineToken,
                SyntaxFactory.NewlineToken
            }.Concat(result);

            var program = new ProgramSyntax(processedSyntaxList, SyntaxFactory.CreateToken(TokenType.EndOfFile, ""), EmptyDiagnosticLookup.Instance, EmptyDiagnosticLookup.Instance);

            var output = PrettyPrinter.PrintProgram(program, new PrettyPrintOptions(NewlineOption.Auto, IndentKindOption.Space, 2, true), EmptyDiagnosticLookup.Instance, EmptyDiagnosticLookup.Instance);

            writer.WriteLine(output);
        }

        private SyntaxBase GetValueForParameter(ParameterDeclarationSyntax syntax)
        {
            var defaultValue = SyntaxHelper.TryGetDefaultValue(syntax);
            if (defaultValue != null)
            {
                if (defaultValue is FunctionCallSyntax defaultValueAsFunctionCall)
                {
                    return CreateCommentSyntaxForFunctionCallSyntax(defaultValueAsFunctionCall.Name.IdentifierName);
                }
                else if (defaultValue is ArraySyntax defaultValueAsArray)
                {
                    var value = defaultValueAsArray.Items.Select(e =>
                    {
                        if (e.Value is FunctionCallSyntax valueAsFunctionCall)
                        {
                            return SyntaxFactory.CreateArrayItem(CreateCommentSyntaxForFunctionCallSyntax(valueAsFunctionCall.Name.IdentifierName));
                        }

                        return e;
                    }).ToList();

                    return SyntaxFactory.CreateArray(value);
                }
                else if (defaultValue is ObjectSyntax defaultValueAsObject)
                {
                    return CheckFunctionCallsInObjectSyntax(defaultValueAsObject);
                }

                return defaultValue;
            }

            if (syntax.Type is VariableAccessSyntax variableAccessSyntax)
            {
                SyntaxBase? allowedDecoratorFirstItem = null;

                var allowedDecorator = syntax.Decorators.Where(e => e.Expression is FunctionCallSyntax functionCallSyntax && functionCallSyntax.Name.IdentifierName == "allowed").Select(e => e.Arguments).FirstOrDefault();

                if (allowedDecorator != null)
                {
                    allowedDecoratorFirstItem = (allowedDecorator.First().Expression as ArraySyntax)?.Items.First().Value;
                }

                switch (variableAccessSyntax.Name.IdentifierName)
                {
                    case "string":
                    default:
                        {
                            var value = (allowedDecoratorFirstItem as StringSyntax)?.SegmentValues.First() ?? "";
                            return SyntaxFactory.CreateStringLiteral(value);
                        }
                    case "int":
                        {
                            var value = (allowedDecoratorFirstItem as IntegerLiteralSyntax)?.Value ?? 0;
                            return SyntaxFactory.CreateIntegerLiteral(value);
                        }
                    case "bool":
                        return SyntaxFactory.CreateBooleanLiteral(false);
                    case "array":
                        return SyntaxFactory.CreateArray(Enumerable.Empty<SyntaxBase>());
                    case "object":
                        return SyntaxFactory.CreateObject(Enumerable.Empty<ObjectPropertySyntax>());
                }
            }

            return SyntaxFactory.NewlineToken;
        }

        private SyntaxBase CheckFunctionCallsInObjectSyntax(ObjectSyntax objectSyntax)
        {
            var value = objectSyntax.Properties.Select(e =>
            {
                if (e.Value is FunctionCallSyntax valueAsFunctionCall)
                {
                    return SyntaxFactory.CreateObjectProperty((e.Key as IdentifierSyntax)?.IdentifierName ?? "", CreateCommentSyntaxForFunctionCallSyntax(valueAsFunctionCall.Name.IdentifierName));
                }
                else if (e.Value is ArraySyntax valueAsFunctionArray)
                {
                    var value = valueAsFunctionArray.Items.Select(f =>
                    {
                        if (f.Value is FunctionCallSyntax valueAsFunctionCall)
                        {
                            return SyntaxFactory.CreateArrayItem(CreateCommentSyntaxForFunctionCallSyntax(valueAsFunctionCall.Name.IdentifierName));
                        }

                        return f;
                    }).ToList();

                    return SyntaxFactory.CreateObjectProperty((e.Key as IdentifierSyntax)?.IdentifierName ?? "", SyntaxFactory.CreateArray(value));
                }
                else if (e.Value is ObjectSyntax valueAsObjectSyntax)
                {
                    var syntax = CheckFunctionCallsInObjectSyntax(valueAsObjectSyntax);
                    var item = SyntaxFactory.CreateObjectProperty((e.Key as IdentifierSyntax)?.IdentifierName ?? "", syntax);
                    return item;
                }

                return e;
            }).ToList();

            return SyntaxFactory.CreateObject(value);
        }

        private SyntaxBase CreateCommentSyntaxForFunctionCallSyntax(string functionName)
        {
            return SyntaxFactory.CreateInvalidSyntaxWithComment($" TODO : please fix the value assigned to this parameter `{functionName}()` ");
        }
    }
}
