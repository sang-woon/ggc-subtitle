import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ChannelType } from '@/types';

import ChannelSelector from '../ChannelSelector';

const channels: ChannelType[] = [
  {
    id: 'ch2',
    name: '상임위',
    code: 'B002',
    stream_url: 'https://example.com/ch2.m3u8',
    livestatus: 0,
    has_schedule: true,
    stt_running: true,
    session_no: 388,
    session_order: 1,
  },
  {
    id: 'ch1',
    name: '본회의',
    code: 'A001',
    stream_url: 'https://example.com/ch1.m3u8',
    livestatus: 1,
    stt_running: false,
  },
  {
    id: 'ch3',
    name: '정회중위원회',
    code: 'C003',
    stream_url: 'https://example.com/ch3.m3u8',
    livestatus: 2,
    stt_running: true,
  },
];

describe('ChannelSelector', () => {
  it('renders loading state', () => {
    render(<ChannelSelector channels={[]} isLoading={true} onSelect={jest.fn()} />);

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('sorts channels by status and shows STT/스케줄 badges', () => {
    const onSelect = jest.fn();

    render(<ChannelSelector channels={channels} isLoading={false} onSelect={onSelect} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('본회의');
    expect(buttons[1]).toHaveTextContent('정회중위원회');

    expect(screen.getAllByText('ON AIR')).toHaveLength(1);
    expect(screen.getAllByText('STT ON').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('제388회 제1차')).toBeInTheDocument();
  });

  it('calls onSelect when channel card is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();

    render(<ChannelSelector channels={channels} isLoading={false} onSelect={onSelect} />);

    await user.click(screen.getByTestId('channel-ch1'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(channels[1]);
  });
});
