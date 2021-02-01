import { Locator, UniDriverList, UniDriver, MapFn, waitFor, NoElementWithLocatorError, MultipleElementsWithLocatorError, isMultipleElementsWithLocatorError, EnterValueOptions } from '@unidriver/core';

type BaseElementContainer = { cy: Cypress.cy; selector: string };
type ElementContainer = BaseElementContainer & { element: Cypress.Chainable<JQuery<HTMLElement>>  };
type ElementsContainer = BaseElementContainer & { elements: Cypress.Chainable<JQuery<HTMLElement>>[] };

type ElementGetter = () => Promise<ElementContainer>;
type ElementsGetter = () => Promise<ElementsContainer>;

export const cypressUniDriverList = (
    elems: ElementsGetter
): UniDriverList<ElementContainer> => {
    const map = async <T> (fn: MapFn<T>) => {
        const { elements, ...rest } = await elems();
        const promises = elements.map((element, i) => {
            const bd = cypressUniDriver(() => Promise.resolve({ element, ...rest }));
            return fn(bd, i);
        });
        return Promise.all(promises);
    };

    return {
        get: (idx: number) => {
            const elem = async () => {
                const { elements, ...rest } = await elems();
                return {
                    element: elements[idx],
                    ...rest
                };
            };
            return cypressUniDriver(elem);
        },
        text: async () => {
            return map((d) => d.text());
        },
        count: async () => {
            const { elements } = await elems();
            return elements.length;
        },
        map,
        filter: (fn) => {
            return cypressUniDriverList(async () => {
                const { elements, ...rest } = await elems();
                const results = await map(fn);
                const filteredElements = elements.filter((_, i) => {
                    return results[i];
                });
                return {
                    elements: filteredElements,
                    ...rest
                };
            });
        }
    };
};

const isBaseContainer = (
    obj: ElementGetter | BaseElementContainer
): obj is BaseElementContainer => {
    return !!(obj as any).page;
};

export const cypressUniDriver = (
    el: ElementGetter | BaseElementContainer
): UniDriver<ElementContainer> => {
    const elem = async () => {
        if (isBaseContainer(el)) {
            const { cy, selector } = el;
            const element = cy.get(selector);
            if (!element) {
                throw new Error(`Cannot find element`);
            }
            return {
                cy,
                element,
                selector
            };
        } else {
            const { element, ...rest } = await el();
            if (!element) {
                throw new Error(`Cannot find element`);
            }
            return {
                ...rest,
                element
            };
        }
    };

    const exists = async () => {
    try {
      await elem();
      return true;
    } catch (e) {
      if (isMultipleElementsWithLocatorError(e)) {
        throw e;
      } else {
        return false;
      }
    }
    };

    const clearValue = async() => {
        const { element } = await elem();
        element.clear();
    };

    return {
        $: (newLoc: Locator) => {
            return cypressUniDriver(async () => {
        const { element, selector, ...rest } = await elem();
        
        const elHandles = await element.$$(newLoc);

        if (elHandles.length === 0) {
          throw new NoElementWithLocatorError(newLoc);
        } else if (elHandles.length > 1) {
          throw new MultipleElementsWithLocatorError(elHandles.length, newLoc);
        } else {
          return {
            ...rest,
            element: elHandles[0],
            selector: `${selector} ${newLoc}`
          };
        }
            });
        },
        $$: (newLoc: Locator) =>
            cypressUniDriverList(async () => {
                const { element, selector, ...rest } = await elem();
                return {
                    ...rest,
                    elements: await element.$$(newLoc),
                    selector: `${selector} ${newLoc}`
                };
            }),
        text: async () => {
            const { element } = await elem();
            return element.its('textContent').toString();
        },
        click: async () => {
            return (await elem()).element.click();
        },
        hover: async () => {
            return (await elem()).element.trigger('mouseover');
        },
        hasClass: async (className: string) => {
            const { element } = await elem();
            const cm = await (await element.getProperty('classList')).jsonValue();
            return Object.keys(cm).map(key => cm[key]).includes(className);
        },
        enterValue: async (
            value: string,
            { delay = 0, shouldClear = true }: EnterValueOptions = {}
          ) => {
            const { element } = await elem();
            const disabled = await (await element.getProperty('disabled')).jsonValue();
      // Don't do anything if element is disabled
      if (disabled) {
        return;
      }
            await element.focus();
            if (shouldClear) {
                await clearValue();
            }
            await element.type(value, {
                delay,
            });
        },
        pressKey: async (key) => {
            const { element } = await elem();
            return element.press(`${key}`);
        },
        exists,
        isDisplayed: async () => {
            const { element } = await elem();
            return element.isIntersectingViewport();
        },
        value: async () => {
            const { element } = await elem();

            const valueHandle = await element.getProperty('value');
            const value = await valueHandle.jsonValue();
            return value || '';
        },
        attr: async name => {
            const { page, element } = await elem();
            return page.evaluate(
                (elem:any, n) => {
                    return elem.getAttribute(n);
                },
                element,
                name
            );
        },
        mouse: {
            press: async () => {
                const { page, selector } = await elem();

                return page.$eval(
                    selector,
                    (elem) => {
                        const mousedown = new MouseEvent('mousedown');
                        mousedown.initEvent(mousedown.type, true, false);
                        elem.dispatchEvent(mousedown);
                    }
                );
            },
            release: async () => {
                const { page, selector } = await elem();

                return page.$eval(
                    selector,
                    (elem) => {
                        const mouseup = new MouseEvent('mouseup');
                        mouseup.initEvent(mouseup.type, true, false);
                        elem.dispatchEvent(mouseup);
                    }
                );
            },
            moveTo: async (to) => {
                const { page, selector } = await elem();
                const native = (await to.getNative());
                const boundingBox = native.element && await native.element.boundingBox();
                
                if (!!boundingBox) {
                    return page.$eval(
                        selector,
                        (elem, boundingBox) => {
                            const mousemove = new MouseEvent('mousemove', { clientX: boundingBox.x, clientY: boundingBox.y });
                            mousemove.initEvent(mousemove.type, true, false);
                            elem.dispatchEvent(mousemove);
                        },
                        boundingBox
                    );
                } else {
                    throw new Error(`Cannot find target element`);
                }
            }
        },
        wait: async (timeout?: number) => {
            return waitFor(exists, timeout);
        },
        type: 'puppeteer',
        scrollIntoView: async () => {
            const { element } = await elem();
            await element.hover();

            return {};
        },
        getNative: elem,
        _prop: async (name: string) => {
            const { page, element } = await elem();
            return page.evaluate(
              (elem: any, n) => {
                  return elem[n];
              },
              element, name
            );
        },
    };
};
