// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Bicep.LanguageServer.Settings
{
    public interface ISettingsProvider
    {
        void AddOrUpdateSetting(string name, bool value);

        bool GetSetting(string name);
    }
}