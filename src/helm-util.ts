// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import * as fs from 'fs';
import { getExecutableExtension, isEqual } from "./utilities"

import * as toolCache from '@actions/tool-cache';
import * as core from '@actions/core';
import * as io from '@actions/io';

const helmToolName = 'helm';
const stableHelmVersion = 'v2.14.1';
const helmLatestReleaseUrl  = 'https://api.github.com/repos/helm/helm/releases/latest';

export interface NameValuePair {
    name: string;
    value: string;
}

export function getHelmDownloadURL(version: string): string {
    switch (os.type()) {
        case 'Linux':
            return util.format('https://get.helm.sh/helm-%s-linux-amd64.zip534435', version);

        case 'Darwin':
            return util.format('https://get.helm.sh/helm-%s-darwin-amd64.zip', version);

        case 'Windows_NT':
        default:
            return util.format('https://get.helm.sh/helm-%s-windows-amd64.zip', version);

    }
}

export async function getStableHelmVersion(): Promise<string> {
    return toolCache.downloadTool(helmLatestReleaseUrl).then((downloadPath) => {
        const response = JSON.parse(fs.readFileSync(downloadPath, 'utf8').toString().trim());
        if (!response.tag_name) {
            return stableHelmVersion;
        }
        
        return response.tag_name;
    }, (error) => {
        core.debug(error);
        core.warning(util.format("Failed to read latest helm version from stable.txt. From URL %s. Using default stable version %s", helmLatestReleaseUrl, stableHelmVersion));
        return stableHelmVersion;
    });
}


export var walkSync = function(dir, filelist, fileToFind) {
    var files = fs.readdirSync(dir);
    filelist = filelist || [];
    files.forEach(function(file) {
      if (fs.statSync(path.join(dir, file)).isDirectory()) {
        filelist = walkSync(path.join(dir, file), filelist, fileToFind);
      }
      else {
          core.debug(file);
          if(file == fileToFind)
          {
             filelist.push(path.join(dir, file));
          }
      }
    });
    return filelist;
  };
  
export async function downloadHelm(version: string): Promise<string> {
    if (!version) { version = await getStableHelmVersion(); }
    let cachedToolpath = toolCache.find(helmToolName, version);
    if (!cachedToolpath) {
        let helmDownloadPath;
        try {
            helmDownloadPath = await toolCache.downloadTool(getHelmDownloadURL(version));
        } catch (exception) {
            throw new Error(util.format("Failed to download Helm from location %s. Error: %s ", getHelmDownloadURL(version), exception));
        }

        fs.chmodSync(helmDownloadPath, '777');
        const unzipedHelmPath = await toolCache.extractZip(helmDownloadPath);
        cachedToolpath = await toolCache.cacheDir(unzipedHelmPath, helmToolName, version);
    }

    const helmpath = findHelm(cachedToolpath);
    if (!helmpath) {
        throw new Error(util.format("Helm executable not found in path ", cachedToolpath));
    }
    
    fs.chmodSync(helmpath, '777');
    return helmpath;
}

export function findHelm(rootFolder: string): string {
    fs.chmodSync(rootFolder, '777');
    var filelist: string[] = [];
    walkSync(rootFolder, filelist, helmToolName + getExecutableExtension());
    if (!filelist) {
        throw new Error(util.format("Helm executable not found in path ", rootFolder));
    }
    else {
        return filelist[0];
    }
}

export async function getHelmPath() {
    var helmPath = "";
    if (core.getInput('helm-version', { required : false })) {
        var version = core.getInput('helm-version', { required: false });
        if ( !!version && version != "latest" ){
            helmPath = toolCache.find('helm', version);
        }

        if (!helmPath) {
            helmPath = await installHelm(version);
        }
    } else {
        helmPath = await io.which('helm', false);
        if (!helmPath) {
            const allVersions = toolCache.findAllVersions('helm');
            helmPath = allVersions.length > 0 ? toolCache.find('helm', allVersions[0]) : '';
            if (!helmPath) {
                throw new Error('helm is not installed, either add setup-helm action or provide "helm-version" input to download helm');
            }
            helmPath = path.join(helmPath, `helm${getExecutableExtension()}`);
        }
    }

    core.debug(util.format("Helm executable path %s", helmPath));
    return helmPath;
}

export async function installHelm(version: string) {
    if (isEqual(version, 'latest')) {
        version = await getStableHelmVersion();
    }
    core.debug(util.format("Downloading helm version %s", version));
    return await downloadHelm(version);
}