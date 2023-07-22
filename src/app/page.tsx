//import Image from 'next/image'
"use client"; // This is a client component 👈🏽

import "tailwindcss/tailwind.css";

import { useState, useEffect } from "react";
import { Amplify, Storage } from 'aws-amplify';
import awsconfig from '../aws-exports';
Amplify.configure(awsconfig);

import "@aws-amplify/ui-react/styles.css";
import {
  withAuthenticator,
  Button,
  Heading,
  Image,
  View,
  Card,
} from "@aws-amplify/ui-react";

import {
  ListObjectsCommand,
  ListObjectsCommandOutput,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { HttpRequest } from "@aws-sdk/protocol-http";
import {
  getSignedUrl,
  S3RequestPresigner,
} from "@aws-sdk/s3-request-presigner";
import { parseUrl } from "@aws-sdk/url-parser";
import { Hash } from "@aws-sdk/hash-node";

/* Manually include formatUrl */

import { buildQueryString } from "@smithy/querystring-builder";
function formatUrl(request : any) {
    const { port, query } = request;
    let { protocol, path, hostname } = request;
    if (protocol && protocol.slice(-1) !== ":") {
        protocol += ":";
    }
    if (port) {
        hostname += `:${port}`;
    }
    if (path && path.charAt(0) !== "/") {
        path = `/${path}`;
    }
    let queryString = query ? buildQueryString(query) : "";
    if (queryString && queryString[0] !== "?") {
        queryString = `?${queryString}`;
    }
    let auth = "";
    if (request.username != null || request.password != null) {
        const username = request.username ?? "";
        const password = request.password ?? "";
        auth = `${username}:${password}@`;
    }
    let fragment = "";
    if (request.fragment) {
        fragment = `#${request.fragment}`;
    }
    return `${protocol}//${auth}${hostname}${path}${queryString}${fragment}`;
}

import { StorageManager } from '@aws-amplify/ui-react-storage';
import '@aws-amplify/ui-react/styles.css';
import { constants } from "http2";

const region = "us-east-2";
const bucket = "secuploadbucket185010-dev";

const createPresignedUrlWithoutClient = async ({ region, bucket, key } : any) => {
  const url = parseUrl(`https://${bucket}.s3.${region}.amazonaws.com/${key}`);
  const presigner = new S3RequestPresigner({
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: "us-east-2" },
      identityPoolId: "us-east-2:56c262a6-bf9c-4ae5-bfa7-7c0e5fe91bd9",
    }),
    region,
    sha256: Hash.bind(null, "sha256"),
  });

  const signedUrlObject = await presigner.presign(new HttpRequest(url));
  return formatUrl(signedUrlObject);
};

const createPresignedUrlWithClient = ({ region, bucket, key } : any) => {
  const client = new S3Client({
    region: "us-east-2",
    // Unless you have a public bucket, you'll need access to a private bucket.
    // One way to do this is to create an Amazon Cognito identity pool, attach a role to the pool,
    // and grant the role access to the 's3:GetObject' action.
    //
    // You'll also need to configure the CORS settings on the bucket to allow traffic from
    // this example site. Here's an example configuration that allows all origins. Don't
    // do this in production.
    //[
    //  {
    //    "AllowedHeaders": ["*"],
    //    "AllowedMethods": ["GET"],
    //    "AllowedOrigins": ["*"],
    //    "ExposeHeaders": [],
    //  },
    //]
    //
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: "us-east-2" },
      identityPoolId: "us-east-2:56c262a6-bf9c-4ae5-bfa7-7c0e5fe91bd9",
    }),
  });
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
};

export const DefaultStorageManagerExample = () => {
  const [message, setMessage] = useState('');

  const [objects, setObjects] = useState<
    Required<ListObjectsCommandOutput>["Contents"]
  >([]);

  const [urls, setUrls] = useState<Array<any>>([]);

  const generateList = async function() {
    const client = new S3Client({
      region: "us-east-2",
      // Unless you have a public bucket, you'll need access to a private bucket.
      // One way to do this is to create an Amazon Cognito identity pool, attach a role to the pool,
      // and grant the role access to the 's3:GetObject' action.
      //
      // You'll also need to configure the CORS settings on the bucket to allow traffic from
      // this example site. Here's an example configuration that allows all origins. Don't
      // do this in production.
      //[
      //  {
      //    "AllowedHeaders": ["*"],
      //    "AllowedMethods": ["GET"],
      //    "AllowedOrigins": ["*"],
      //    "ExposeHeaders": [],
      //  },
      //]
      //
      credentials: fromCognitoIdentityPool({
        clientConfig: { region: "us-east-2" },
        identityPoolId: "us-east-2:56c262a6-bf9c-4ae5-bfa7-7c0e5fe91bd9",
      }),
    });
    const command = new ListObjectsCommand({
      Bucket: bucket
    });
    client.send(command).then(({ Contents }) => {
      let tempUrls : Promise<string>[] = [];
      let contentList : Array<any> = [];
      Contents?.map(obj => {
        console.log(obj);
        tempUrls.push(createPresignedUrlWithClient({ region: region, bucket: bucket, key: obj.Key }));
        contentList.push({
          ...obj,
          "Key": obj.Key,
          "Url": tempUrls[tempUrls.length - 1].then(result => { return result; })
        });
      });
      console.log(tempUrls);
      Promise.all(tempUrls).then(results => {
        results.map(result => {
          contentList = contentList.map(el => {
            if (el.Key == decodeURIComponent((result.match(/(public\/[^\?]+)/) || '')[1] || '')) {
              return {
                ...el,
                Url: result
              }
            } else {
              return el;
            }
          });
        });
        setUrls(contentList);
      });
      setObjects(Contents || []);
    });
  }

  useEffect(() => {
    generateList();
  }, []);

  const onSuccess = ({ key } : any) => {
    setMessage(`Key: ${key}`);
    generateList();
  };
  const onError = (err: any) => {
    setMessage(`${err}`);
  };

  function updateShowCopied(key: string, copied: boolean) {
    let contentList = urls;
    contentList = contentList.map(el => {
      if (el.Url == key) {
        return {
          ...el,
          showCopied: copied
        }
      } else {
        return {
          ...el,
          showCopied: false
        }
      }
    });
    setUrls(contentList);
  }

  function fallbackCopyTextToClipboard(text: string) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
  
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
  
    try {
      var successful = document.execCommand('copy');
      var msg = successful ? 'successful' : 'unsuccessful';
      console.log('Fallback: Copying text command was ' + msg);
      updateShowCopied(text, true);
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
  
    document.body.removeChild(textArea);
  }

  function copyTextToClipboard(text: string) {
    if (!navigator.clipboard) {
      fallbackCopyTextToClipboard(text);
      return;
    }
    navigator.clipboard.writeText(text).then(function() {
      console.log('Async: Copying to clipboard was successful!');
      updateShowCopied(text, true);
    }, function(err) {
      console.error('Async: Could not copy text: ', err);
    });
  }

  const onFocus = (e: any) => {
    e.preventDefault();
    let input = e.target.parentNode.querySelector('input');
    input.select();
    copyTextToClipboard(input.value);
  };

  const [sortMethod, setSortMethod] = useState('LastModified');
  const [sortDir, setSortDir] = useState(true);

  const sortUrls = (method: string) => {
    let tempUrls = [...urls];
    const asc = (method != sortMethod || !sortDir);
    
    if (['Name', 'Size', 'LastModified'].indexOf(method) < 0) return false;

    setSortDir(asc);

    tempUrls.sort((a, b) => {
      switch (method) {
        case 'Name':
          if (a.Key.toLowerCase() > b.Key.toLowerCase()) {
            return asc ? 1 : -1;
          } else if (a.Key.toLowerCase() < b.Key.toLowerCase()) {
            return asc ? -1 : 1;
          } else {
            return 0;
          }
        break;
        case 'Size':
          return asc ? a.Size - b.Size : b.Size - a.Size;
        break;
        case 'LastModified':
          console.log(a.LastModified);
          if (a.LastModified.getTime() > b.LastModified.getTime()) {
            return asc ? 1 : -1;
          } else if (a.LastModified.getTime() < b.LastModified.getTime()) {
            return asc ? -1 : 1;
          } else {
            return 0;
          }
        break;
      }
      return 0;
    });

    setSortMethod(method);
    setUrls(tempUrls);
  };

  return (
    <>
      <StorageManager
        onUploadSuccess={onSuccess}
        onUploadError={onError}
        acceptedFileTypes={['image/*', '.pdf', '.doc', '.docx', '.txt', '.csv', '.xls']}
        accessLevel="public"
        maxFileCount={10}
        maxFileSize={10000000}
      />
      {message}
      <div className="files-table">
        <div className="md:px-32 py-8 w-full">
          <div className="shadow overflow-hidden rounded border-b border-gray-200">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="w-1/3 text-left py-3 px-4 uppercase font-semibold text-sm hover:text-blue-500 cursor-pointer" onClick={() => { sortUrls('Name'); }}>Name</th>
                  <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Link</th>
                  <th className="w-1/8 text-left py-3 px-4 uppercase font-semibold text-sm hover:text-blue-500 cursor-pointer" onClick={() => { sortUrls('Size'); }}>Size</th>
                  <th className="w-1/6 text-left py-3 px-4 uppercase font-semibold text-sm hover:text-blue-500 cursor-pointer" onClick={() => { sortUrls('LastModified'); }}>Modified</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {urls?.map((o) => {
                  const keyName = o.Key;
                  return (
                    <tr key={o.ETag}>
                      <td className="w-1/3 text-left py-3 px-4 font-semibold"><a className="hover:text-blue-500" href={o.Url} target="_blank">{keyName}</a></td>
                      <td className="text-left py-3 px-4 flex flex-row"><input type="text" className="grow text-left py-2 px-4 rounded text-blue-900 bg-blue-50 border-b border-blue-900 font-light underline cursor-pointer" value={o.Url} readOnly onClick={onFocus} /> <a className="flex-none text-left py-2 px-4 rounded cursor-pointer" onClick={onFocus}>📋</a> <span className={`flex-none bg-green-50 text-green-900 text-left py-2 px-4 rounded ${o.showCopied ? '' : 'invisible'}`}>Copied!</span></td>
                      <td className="w-1/8 text-left py-3 px-4">{(o.Size / 1024 / 1024).toFixed(2)} MB</td>
                      <td className="w-1/6 text-left py-3 px-4">{o.LastModified.toString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

function signOut(e: any) {
  window.close();
}

function App({ signOut } : any) {
  return (
    <View className="App">
      <Card>
        <Heading level={5}>S3 Bucket Uploader<span className="text-right pl-3"><Button onClick={signOut}>Sign Out</Button></span></Heading>
      </Card>
      <DefaultStorageManagerExample/>
    </View>
  );
}

export default withAuthenticator(App);