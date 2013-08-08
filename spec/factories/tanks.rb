# Read about factories at https://github.com/thoughtbot/factory_girl

FactoryGirl.define do
  factory :tank do
    position 1
    player_id 1
    game_id 1
    fake false
  end
end
