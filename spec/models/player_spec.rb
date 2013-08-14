require 'spec_helper'

describe Player do
  it "has a valid factory" do
    FactoryGirl.create(:player).should be_valid
  end
end
