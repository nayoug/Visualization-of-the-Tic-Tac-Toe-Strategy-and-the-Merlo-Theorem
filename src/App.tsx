import { useState, useEffect, useRef, useCallback } from 'react';
import { hierarchy, tree } from 'd3-hierarchy';
import { max, min } from 'd3-array';
import { select } from 'd3-selection';
import { GameNode, generateGameTree } from './gameLogic';

function App() {
  const [root, setRoot] = useState<GameNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GameNode | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<GameNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [renderKey, setRenderKey] = useState(0);
  const [displayMode, setDisplayMode] = useState<'forward' | 'backward'>('forward');
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 辅助函数：从原始树中查找节点
  const findNodeById = (node: GameNode, id: string): GameNode | null => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
    return null;
  };

  // 初始化博弈树 - 默认只显示根节点
  useEffect(() => {
    const gameTree = generateGameTree(9);

    // 计算最大层数
    let maxL = 0;
    const calcMaxLayer = (node: GameNode) => {
      maxL = Math.max(maxL, node.layerFromTerminal);
      node.children.forEach(calcMaxLayer);
    };
    calcMaxLayer(gameTree);

    // 只展开根节点
    const initialExpanded = new Set<string>();
    initialExpanded.add(gameTree.id);
    setExpandedNodes(initialExpanded);
    setRoot(gameTree);
  }, []);

  // 重新渲染树
  useEffect(() => {
    if (!root || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const nodeSize = 70;
    const levelHeight = 120;

    // 创建临时root，只包含可见节点
    const buildVisibleTree = (node: GameNode): GameNode => {
      // 只要节点在 expandedNodes 中就显示它
      if (!expandedNodes.has(node.id)) {
        return { ...node, children: [] };
      }
      const visibleNode: GameNode = { ...node, children: [] };
      if (node.children) {
        visibleNode.children = node.children
          .filter(child => expandedNodes.has(child.id))
          .map(child => buildVisibleTree(child));
      }
      return visibleNode;
    };
    const treeRoot = buildVisibleTree(root);

    // 计算树的维度
    const hierarchyData = hierarchy(treeRoot, d => d.children);
    const treeLayout = tree<GameNode>()
      .nodeSize([nodeSize, levelHeight])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.2));

    const treeData = treeLayout(hierarchyData);
    const nodes = treeData.descendants();

    // 计算节点分布范围
    const xValues = nodes.map(d => d.x);
    const minX = min(xValues) || 0;
    const maxX = max(xValues) || 0;
    const yValues = nodes.map(d => d.y);
    const maxY = max(yValues) || 0;

    // 计算SVG尺寸
    const svgWidth = maxX - minX + nodeSize * 4;
    const svgHeight = maxY + levelHeight * 2;

    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    svg
      .attr('width', svgWidth)
      .attr('height', svgHeight);

    const g = svg.append('g')
      .attr('transform', `translate(${-minX + nodeSize * 2}, ${levelHeight})`);

    // 绘制边
    g.selectAll('.link')
      .data(treeData.links())
      .enter()
      .append('path')
      .attr('class', d => {
        const isPath = highlightedPath.some((n, i) =>
          i > 0 && n.id === d.target.data.id &&
          highlightedPath[i - 1].id === d.source.data.id
        );
        return isPath ? 'link path-edge' : 'link edge-path';
      })
      .attr('d', (d: any) => {
        const sourceX = d.source.x;
        const sourceY = d.source.y;
        const targetX = d.target.x;
        const targetY = d.target.y;
        return `M${sourceX},${sourceY + 25} Q${sourceX},${(sourceY + targetY) / 2} ${targetX},${targetY - 25}`;
      })
      .attr('fill', 'none')
      .attr('stroke', (d: any) => {
        const isPath = highlightedPath.some((n, i) =>
          i > 0 && n.id === d.target.data.id &&
          highlightedPath[i - 1].id === d.source.data.id
        );
        if (isPath) {
          const pathNode = highlightedPath.find(n => n.id === d.target.data.id);
          if (pathNode) {
            return pathNode.strategyType === 'win' ? '#22c55e' :
                   pathNode.strategyType === 'lose' ? '#ef4444' : '#eab308';
          }
        }
        return '#d1d5db';
      })
      .attr('stroke-width', (d: any) => {
        const isPath = highlightedPath.some((n, i) =>
          i > 0 && n.id === d.target.data.id &&
          highlightedPath[i - 1].id === d.source.data.id
        );
        return isPath ? 3 : 1.5;
      });

    // 边的标签（走法位置 1-9）
    g.selectAll('.edge-label')
      .data(treeData.links())
      .enter()
      .append('text')
      .attr('class', 'edge-label')
      .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
      .attr('y', (d: any) => (d.source.y + d.target.y) / 2)
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .text((d: any) => d.target.data.movePosition)
      .style('font-size', '10px')
      .style('fill', '#6b7280');

    // 绘制节点
    const nodeGroups = g.selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', d => {
        const isHighlighted = highlightedPath.some(n => n.id === d.data.id);
        const isFaded = highlightedPath.length > 0 && !isHighlighted;
        const hasChildren = d.data.children && d.data.children.length > 0;
        return `node ${d.data.strategyType} ${isHighlighted ? 'highlighted' : ''} ${isFaded ? 'faded' : ''} ${hasChildren ? 'expandable' : ''}`;
      })
      .attr('transform', d => `translate(${d.x}, ${d.y})`);

    // 为每个节点组添加点击事件
    nodeGroups.on('click', function(event: MouseEvent, d: any) {
      event.stopPropagation();
      // 从原始root树中获取完整节点（包含所有children）
      const originalNode = findNodeById(root, d.data.id);
      handleNodeClick(originalNode || d.data);
    });

    // 节点背景
    nodeGroups.append('rect')
      .attr('class', 'node-rect')
      .attr('x', -28)
      .attr('y', -28)
      .attr('width', 56)
      .attr('height', 56)
      .attr('rx', 6)
      .attr('fill', d => {
        const strategy = d.data.strategyType;
        return strategy === 'win' ? '#dcfce7' :
               strategy === 'lose' ? '#fee2e2' :
               strategy === 'draw' ? '#fef9c3' : '#f3f4f6';
      })
      .attr('stroke', d => {
        const strategy = d.data.strategyType;
        const isSelected = selectedNode?.id === d.data.id;
        return isSelected ? '#3b82f6' :
               strategy === 'win' ? '#22c55e' :
               strategy === 'lose' ? '#ef4444' :
               strategy === 'draw' ? '#eab308' : '#d1d5db';
      })
      .attr('stroke-width', d => selectedNode?.id === d.data.id ? 3 : 2);

    // 棋盘格子
    const cellSize = 16;
    const startX = -24;
    const startY = -24;

    nodeGroups.each(function(d: any) {
      const nodeGroup = select(this);
      const board = d.data.board;

      for (let i = 0; i < 9; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = startX + col * cellSize;
        const y = startY + row * cellSize;

        nodeGroup.append('rect')
          .attr('class', 'node-board-cell')
          .attr('x', x)
          .attr('y', y)
          .attr('width', cellSize - 1)
          .attr('height', cellSize - 1)
          .attr('fill', 'white')
          .attr('stroke', '#e5e7eb')
          .attr('stroke-width', 0.5);

        if (board[i]) {
          nodeGroup.append('text')
            .attr('x', x + cellSize / 2)
            .attr('y', y + cellSize / 2 + 4)
            .attr('text-anchor', 'middle')
            .attr('class', 'node-board')
            .attr('fill', board[i] === 'X' ? '#3b82f6' : '#f97316')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .text(board[i]);
        }
      }
    });

  }, [root, highlightedPath, selectedNode, expandedNodes, renderKey]);

  const handleNodeClick = useCallback((node: GameNode) => {
    setSelectedNode(node);

    // 点击节点时，展开该节点的下一层
    if (node.children && node.children.length > 0) {
      setExpandedNodes(prev => {
        const newSet = new Set(prev);

        // 检查该节点的子节点是否已展开
        const hasExpandedChildren = node.children.some(child => newSet.has(child.id));

        if (hasExpandedChildren) {
          // 折叠：该节点的所有子节点及其后代
          const removeDescendants = (n: GameNode) => {
            newSet.delete(n.id);
            n.children?.forEach(child => removeDescendants(child));
          };
          node.children.forEach(child => removeDescendants(child));
        } else {
          // 展开：添加该节点的直接子节点
          node.children.forEach(child => newSet.add(child.id));
        }
        return newSet;
      });
      setRenderKey(k => k + 1);
    }

    // 只高亮当前选中的节点，不淡化其他节点
    setHighlightedPath([node]);
  }, []);

  const handleReset = () => {
    if (!root) return;
    // 重置到初始状态（只显示叶子节点）
    const leafNodes = new Set<string>();
    const collectLeaves = (node: GameNode) => {
      if (node.children.length === 0) {
        leafNodes.add(node.id);
      } else {
        node.children.forEach(collectLeaves);
      }
    };
    collectLeaves(root);
    setExpandedNodes(leafNodes);
    setSelectedNode(null);
    setHighlightedPath([]);
    setRenderKey(k => k + 1);
  };

  const getStrategyText = (strategy: string) => {
    return strategy === 'win' ? '先手必胜' :
           strategy === 'lose' ? '后手必胜' : '平局';
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>策梅洛定理可视化之井字棋</h1>
        <p>通过逆向归纳法展示博弈树的先手必胜/后手必胜/平局策略</p>
      </div>

      <div className="main-content">
        <div className="tree-section">
          <div className="control-panel">
            <button
              onClick={() => setDisplayMode('forward')}
              style={{ background: displayMode === 'forward' ? '#3b82f6' : 'white', color: displayMode === 'forward' ? 'white' : 'black' }}
            >
              正向模式
            </button>
            <button
              onClick={() => {
                setDisplayMode('backward');
                // 显示 5→2→1→9→4 这条唯一路径，最后一个节点展开所有后续分支
                if (root) {
                  let current = root;
                  const fixedMoves = [5, 2, 1, 9, 4];

                  // 沿着路径前进，找到目标节点
                  for (const move of fixedMoves) {
                    const child = current.children.find(c => c.movePosition === move);
                    if (child) {
                      current = child;
                    }
                  }

                  // 构建展开的节点集合：路径上的所有节点 + 最后一个节点的所有后续分支
                  const allIds = new Set<string>();
                  let node = root;
                  allIds.add(node.id);

                  // 添加路径上的节点
                  for (const move of fixedMoves) {
                    const child = node.children.find(c => c.movePosition === move);
                    if (child) {
                      allIds.add(child.id);
                      node = child;
                    }
                  }

                  // 添加最后一个节点的所有后续分支
                  const addAllChildren = (n: GameNode) => {
                    allIds.add(n.id);
                    n.children.forEach(addAllChildren);
                  };
                  addAllChildren(node);

                  setExpandedNodes(allIds);
                  setSelectedNode(null);
                  setHighlightedPath([]);
                  setRenderKey(k => k + 1);
                }
              }}
              style={{ background: displayMode === 'backward' ? '#3b82f6' : 'white', color: displayMode === 'backward' ? 'white' : 'black' }}
            >
              逆向模式
            </button>
            <button onClick={handleReset}>重置</button>
          </div>

          <div className="tree-container" ref={containerRef}>
            <svg ref={svgRef} className="tree-svg" />
          </div>
        </div>

        <div className="info-panel">
          {selectedNode ? (
            <>
              <div className="node-info">
                <h3>节点信息</h3>
                <div className="node-info-grid">
                  <span className="label">当前玩家:</span>
                  <span>{selectedNode.player}</span>
                  <span className="label">策略类型:</span>
                  <span style={{
                    color: selectedNode.strategyType === 'win' ? '#22c55e' :
                           selectedNode.strategyType === 'lose' ? '#ef4444' : '#eab308'
                  }}>
                    {getStrategyText(selectedNode.strategyType)}
                  </span>
                  <span className="label">可选走法:</span>
                  <span>{selectedNode.children.length}个</span>
                </div>
                {selectedNode.bestChildren && selectedNode.bestChildren.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '0.875rem' }}>
                    <span className="label">最优走法位置: </span>
                    {selectedNode.bestChildren.map(c => c.movePosition).join(', ')}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="node-info">
              <h3>节点信息</h3>
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>点击节点查看详细信息</p>
            </div>
          )}

          <div className="legend">
            <h4>策略类型图例</h4>
            <div className="legend-item">
              <div className="legend-color win"></div>
              <span>先手必胜 - 先手X存在必胜策略</span>
            </div>
            <div className="legend-item">
              <div className="legend-color lose"></div>
              <span>后手必胜 - 后手O存在必胜策略</span>
            </div>
            <div className="legend-item">
              <div className="legend-color draw"></div>
              <span>平局 - 双方都无法必胜，最终平局</span>
            </div>
          </div>

          <div className="theorem-panel">
            <h3>策梅洛定理</h3>
            <p>
              在任何一个双人、有限、确定、完美信息的零和游戏中，以下三者必有其一（也只有其一）成立：
                1.先手有必胜策略
                2.后手有必胜策略
                3.双方都有策略可以保证游戏平局
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
