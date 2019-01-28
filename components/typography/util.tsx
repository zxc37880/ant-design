import { render, unmountComponentAtNode } from 'react-dom';
import * as React from 'react';
import toArray from 'rc-util/lib/Children/toArray';

interface MeasureResult {
  finished: boolean;
  reactNode: React.ReactNode;
}

// We only handle element & text node.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

let ellipsisContainer: HTMLParagraphElement;

const wrapperStyle: React.CSSProperties = {
  padding: 0,
  margin: 0,
  display: 'inline',
  lineHeight: 'inherit',
};

function pxToNumber(value: string | null): number {
  if (!value) return 0;

  const match = value.match(/^\d*(\.\d*)?/);

  return match ? Number(match[0]) : 0;
}

function styleToStr(style: CSSStyleDeclaration) {
  let styleStr: string = '';
  // There are some different behavior between Firefox & Chrome.
  // We have to handle this ourself.
  for (let i = style.length; i >= 0; i -= 1) {
    const name = style[i];
    styleStr += `${name}: ${style.getPropertyValue(name)};`;
  }
  return styleStr;
}

export function measure(
  originEle: HTMLParagraphElement,
  rows: number,
  content: React.ReactNode,
  fixedContent: React.ReactNode[],
  ellipsisStr: string,
): { content: React.ReactNode; text: string; ellipsis: boolean } {
  if (!ellipsisContainer) {
    ellipsisContainer = document.createElement('div');
    ellipsisContainer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ellipsisContainer);
  }

  // Get origin style
  const originStyle = window.getComputedStyle(originEle);
  const originCSS = styleToStr(originStyle);
  const lineHeight = pxToNumber(originStyle.lineHeight);
  const maxHeight =
    lineHeight * (rows + 1) + pxToNumber(originStyle.paddingTop) + pxToNumber(originStyle.paddingBottom);

  // Set shadow
  ellipsisContainer.setAttribute('style', originCSS);
  ellipsisContainer.style.position = 'fixed';
  ellipsisContainer.style.left = '0';
  ellipsisContainer.style.height = 'auto';
  ellipsisContainer.style.minHeight = 'auto';
  ellipsisContainer.style.maxHeight = 'auto';
  ellipsisContainer.style.top = '0px';
  ellipsisContainer.style.zIndex = '99999999';
  // ellipsisText.style.top = '-999999px';
  // ellipsisText.style.zIndex = '-1000';

  // Render in the fake container
  const contentList: React.ReactNode[] = toArray(content);
  render(
    <div style={wrapperStyle}>
      <span style={wrapperStyle}>{contentList}</span>
      <span style={wrapperStyle}>{fixedContent}</span>
    </div>,
    ellipsisContainer,
  ); // wrap in an div for old version react

  // Check if ellipsis in measure div is height enough for content
  function inRange() {
    console.log('in range:', ellipsisContainer.offsetHeight, maxHeight, ellipsisContainer.offsetHeight < maxHeight);
    return ellipsisContainer.offsetHeight < maxHeight;
  }

  // Skip ellipsis if already match
  if (inRange()) {
    unmountComponentAtNode(ellipsisContainer);
    return { content, text: ellipsisContainer.innerHTML, ellipsis: false };
  }

  // We should clone the childNode since they're controlled by React and we can't reuse it without warning
  const childNodes: ChildNode[] = Array.prototype.slice.apply(ellipsisContainer.childNodes[0].childNodes[0].cloneNode(true).childNodes);
  const fixedNodes: ChildNode[] = Array.prototype.slice.apply(ellipsisContainer.childNodes[0].childNodes[1].cloneNode(true).childNodes);
  unmountComponentAtNode(ellipsisContainer);

  // ========================= Find match ellipsis content =========================
  const ellipsisChildren: React.ReactNode[] = [];
  ellipsisContainer.innerHTML = '';

  const ellipsisTextNode = document.createTextNode(ellipsisStr);
  ellipsisContainer.appendChild(ellipsisTextNode);

  fixedNodes.forEach(childNode => {
    ellipsisContainer.appendChild(childNode);
  });
  
  // Append before fixed nodes
  function appendChildNode(node: ChildNode) {
    ellipsisContainer.insertBefore(node, ellipsisTextNode);
  }

  // Get maximum text
  function measureText(textNode: Text, fullText: string, startLoc = 0, endLoc = fullText.length): MeasureResult {
    const currentText = fullText.slice(0, endLoc);
    textNode.textContent = currentText;

    console.warn('>>>', startLoc, endLoc, currentText);

    if (startLoc >= endLoc - 1) {
      return {
        finished: true,
        reactNode: fullText.slice(0, startLoc),
      };
    }

    // Match line height
    if (inRange()) {
      if (endLoc === fullText.length) {
        // All matched
        return {
          finished: false,
          reactNode: fullText,
        };
      }
      return measureText(textNode, fullText, Math.floor((startLoc + endLoc) / 2), endLoc);
    }

    // Not match
    return measureText(textNode, fullText, startLoc, Math.ceil((startLoc + endLoc) / 2));
    // const midLoc = Math.ceil((startLoc + endLoc) / 2);
    // const currentText = fullText.slice(0, midLoc);
    // textNode.textContent = currentText;

    // // Find the match location
    // if (endLoc === midLoc) {
    //   console.log('text:', startLoc, midLoc, endLoc, currentText);
    //   return {
    //     finished: midLoc !== fullText.length, // stop measure if text not fully used
    //     reactNode: currentText,
    //   }
    // }

    // if (inRange()) {
    //   return measureText(textNode, fullText, midLoc, endLoc);
    // } else {
    //   return measureText(textNode, fullText, startLoc, midLoc);
    // }
  }

  function measure(childNode: ChildNode, index: number): MeasureResult {
    const type = childNode.nodeType;

    if (type === ELEMENT_NODE) {
      // We don't split element, it will keep if whole element can be displayed.
      appendChildNode(childNode);
      if (inRange()) {
        return {
          finished: false,
          reactNode: contentList[index],
        };
      }

      // Clean up if can not pull in
      ellipsisContainer.removeChild(childNode);
      return {
        finished: true,
        reactNode: null,
      };
    } else if (type === TEXT_NODE) {
      const fullText = childNode.textContent || '';
      const textNode = document.createTextNode(fullText);
      appendChildNode(textNode);
      return measureText(textNode, fullText);
    }

    // Not handle other type of content
    return {
      finished: false,
      reactNode: null,
    };
  }

  console.clear();
  console.log('----------- Start --------------');
  childNodes.some((childNode, index) => {
    const { finished, reactNode } = measure(childNode, index);
    console.log('Measure:', childNode, index, finished, reactNode);
    if (reactNode) {
      ellipsisChildren.push(reactNode);
    }
    return finished;
  });

  return {
    content: ellipsisChildren,
    text: ellipsisContainer.innerHTML,
    ellipsis: true,
  };
}
